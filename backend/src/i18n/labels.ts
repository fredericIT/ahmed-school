import type { ItemUnit } from '@prisma/client';
import { msg, t } from '.';

/** English names of the code values stored in the database; `label()` translates them. */
const LABELS: Record<string, string> = {
  SUPER_ADMIN: msg('Super admin'),
  ADMIN: msg('Admin'),
  TEACHER: msg('Teacher'),
  NURSERY: msg('Nursery'),
  PRIMARY: msg('Primary'),
  MALE: msg('Boy'),
  FEMALE: msg('Girl'),
  ACTIVE: msg('Active'),
  INACTIVE: msg('Inactive'),
  PENDING: msg('Pending activation'),
  TRANSFERRED: msg('Transferred'),
  GRADUATED: msg('Graduated'),
  WITHDRAWN: msg('Withdrawn'),
  PRESENT: msg('Present'),
  ABSENT: msg('Absent'),
  LATE: msg('Late'),
  EXCUSED: msg('Excused'),
  SICK: msg('Sick'),
  SPORTS: msg('Sports'),
  TRIP: msg('Trip'),
  CELEBRATION: msg('Celebration'),
  CULTURAL: msg('Cultural'),
  ACADEMIC: msg('Academic'),
  HEALTH: msg('Health'),
  PARENT_MEETING: msg('Parent meeting'),
  OTHER: msg('Other'),
  PLANNED: msg('Planned'),
  ONGOING: msg('Ongoing'),
  COMPLETED: msg('Completed'),
  CANCELLED: msg('Cancelled'),
  IN: msg('Stock in'),
  OUT: msg('Stock out'),
  ADJUSTMENT: msg('Adjustment'),
  RETURN: msg('Return'),
  NEW: msg('New'),
  GOOD: msg('Good'),
  FAIR: msg('Fair'),
  POOR: msg('Poor'),
  DAMAGED: msg('Damaged'),
  AVAILABLE: msg('Available'),
  BORROWED: msg('Borrowed'),
  RETURNED: msg('Returned'),
  OVERDUE: msg('Overdue'),
  LOST: msg('Lost'),
  CLASSWORK: msg('Classwork'),
  HOMEWORK: msg('Homework'),
  QUIZ: msg('Quiz'),
  TEST: msg('Test'),
  PROJECT: msg('Project'),
  EXAM: msg('Exam'),
  // stock flags in reports
  LOW: msg('Low'),
  EXPIRED: msg('Expired'),
  EXPIRING: msg('Expiring'),
  OK: msg('OK'),
};

/** Unit abbreviations, in English as stored in notifications. */
export const UNIT_LABELS: Record<ItemUnit, string> = {
  PCS: msg('pcs'),
  BOX: msg('box'),
  KG: msg('kg'),
  LITRE: msg('litre'),
  PACK: msg('pack'),
};

/** The translated name of a code value: `label('PARENT_MEETING')` → "Parent meeting" / "Réunion de parents". */
export function label(value: string | null | undefined): string {
  if (!value) return '';
  return t(LABELS[value] ?? UNIT_LABELS[value as ItemUnit] ?? value);
}
