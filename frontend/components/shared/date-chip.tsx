import { dateFormat } from '@/lib/utils';

export function DateChip({ date }: { date: string }) {
  const d = new Date(date);
  return (
    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-sunny/20 text-sunny-700 dark:text-sunny">
      <span className="text-[10px] font-bold uppercase leading-none">{dateFormat({ month: 'short' }).format(d)}</span>
      <span className="font-heading text-base font-black leading-tight">{d.getUTCDate()}</span>
    </span>
  );
}
