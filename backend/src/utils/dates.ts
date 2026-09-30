/**
 * Date helpers. Calendar dates (@db.Date columns) are handled as 'YYYY-MM-DD'
 * strings and stored as UTC midnight, so they never shift with server timezone.
 */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function toDateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function fmtDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : '';
}

/** Today's calendar date in the given IANA timezone, as YYYY-MM-DD. */
/** en-CA formats dates as YYYY-MM-DD: a machine format, not text for people. */
const ISO_LOCALE = 'en-CA'; // i18n-ignore

export function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat(ISO_LOCALE, {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = toDateOnly(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fmtDate(d);
}

export function isWeekend(iso: string): boolean {
  const day = toDateOnly(iso).getUTCDay();
  return day === 0 || day === 6;
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function ageInYears(dob: Date, onIso: string): number {
  const on = toDateOnly(onIso);
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}
