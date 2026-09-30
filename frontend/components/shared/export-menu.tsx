'use client';
import { useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api, errorMessage } from '@/lib/api';
import { t } from '@/lib/i18n';

type Query = Record<string, string | number | boolean | null | undefined>;

export function ExportMenu({
  path,
  query,
  label = t('Export'),
  size = 'default',
}: {
  path: string;
  query?: Query;
  label?: string;
  size?: 'default' | 'sm';
}) {
  const [busy, setBusy] = useState(false);
  const run = async (format: 'xlsx' | 'pdf') => {
    setBusy(true);
    const id = toast.loading(format === 'pdf' ? t('Preparing PDF file…') : t('Preparing Excel file…'));
    try {
      await api.download(path, {
        ...query,
        format,
        page: undefined,
        pageSize: undefined,
      });
      toast.success(t('Download ready'), { id });
    } catch (e) {
      toast.error(errorMessage(e), { id });
    } finally {
      setBusy(false);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} loading={busy}>
          {!busy && <Download aria-hidden />}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => run('xlsx')}>
          <FileSpreadsheet className="text-emerald-600" aria-hidden /> {t('Excel (.xlsx)')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run('pdf')}>
          <FileText className="text-red-500" aria-hidden /> {t('PDF')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
