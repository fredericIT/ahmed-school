// i18n-ignore-file: Kinyarwanda names from CLDR and locale codes, not English text.
/**
 * Browsers ship without Kinyarwanda date and number data (Chrome's Intl falls back to English), while the
 * API's Node runtime has it. When the runtime lacks it, dates are formatted with English patterns and the
 * month and weekday names swapped for Kinyarwanda ones (CLDR), matching what the API prints on PDFs.
 */
const MONTHS = [
  'Mutarama',
  'Gashyantare',
  'Werurwe',
  'Mata',
  'Gicurasi',
  'Kamena',
  'Nyakanga',
  'Kanama',
  'Nzeri',
  'Ukwakira',
  'Ugushyingo',
  'Ukuboza',
];
const MONTHS_SHORT = ['Mut.', 'Gas.', 'Wer.', 'Mat.', 'Gic.', 'Kam.', 'Nya.', 'Kan.', 'Nze.', 'Ukw.', 'Ugu.', 'Uku.'];
const WEEKDAYS = [
  'Ku cyumweru',
  'Kuwa mbere',
  'Kuwa kabiri',
  'Kuwa gatatu',
  'Kuwa kane',
  'Kuwa gatanu',
  'Kuwa gatandatu',
];
const WEEKDAYS_SHORT = ['Cyu.', 'Mbe.', 'Kab.', 'Gtu.', 'Kan.', 'Gnu.', 'Gnd.'];

export interface DateFormatter {
  format(date: Date): string;
}

const supported = new Map<string, boolean>();
/** Whether this JavaScript runtime has date data for the locale. */
export function hasLocaleData(locale: string): boolean {
  if (!supported.has(locale)) supported.set(locale, Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0);
  return supported.get(locale) as boolean;
}

/** A Kinyarwanda date formatter built on English patterns (day before month, 24-hour clock). */
export function kinyarwandaDates(options: Intl.DateTimeFormatOptions): DateFormatter {
  const base = new Intl.DateTimeFormat('en-GB', options);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: options.timeZone, month: 'numeric', weekday: 'short' });
  const EN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // "29 Nzeri 2026" like Node's rw-RW: full month names next to a day, abbreviations when the month stands alone.
  const shortMonth = options.month === 'short' && !options.day;
  return {
    format(date) {
      const p = parts.formatToParts(date);
      const month = Number(p.find((x) => x.type === 'month')?.value ?? 1) - 1;
      const day = EN_DAYS.indexOf(p.find((x) => x.type === 'weekday')?.value ?? 'Sun');
      return base
        .formatToParts(date)
        .map((x) => {
          if (x.type === 'month' && Number.isNaN(Number(x.value)))
            return shortMonth ? MONTHS_SHORT[month] : MONTHS[month];
          if (x.type === 'weekday')
            return options.weekday === 'long'
              ? WEEKDAYS[day]
              : options.weekday === 'narrow'
                ? WEEKDAYS_SHORT[day][0]
                : WEEKDAYS_SHORT[day];
          return x.value;
        })
        .join('');
    },
  };
}

/** Kinyarwanda writes numbers like 1.234,5 (CLDR); Indonesian uses the same separators and percent style. */
export const KINYARWANDA_NUMBERS = 'id-ID';
