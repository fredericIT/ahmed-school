'use client';
import { useRef, useState } from 'react';
import { Camera, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';

const MAX_MB = 2;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function validateImage(file: File): string | null {
  if (!TYPES.includes(file.type)) return t('Please choose a JPEG, PNG, WEBP or GIF image');
  if (file.size > MAX_MB * 1024 * 1024) return t('Image must be smaller than {size} MB', { size: MAX_MB });
  return null;
}

/**
 * Square image picker with preview. Either uploads immediately (onUpload) or just hands the file
 * back (onSelect) for forms that upload after the record is created.
 */
export function ImageUpload({
  value,
  onSelect,
  onUpload,
  label = t('Upload photo'),
  shape = 'rounded',
  className,
}: {
  value?: string | null;
  onSelect?: (file: File | null) => void;
  onUpload?: (file: File) => Promise<unknown>;
  label?: string;
  shape?: 'rounded' | 'circle';
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const src = preview ?? value ?? null;

  const handle = async (file?: File) => {
    if (!file) return;
    const err = validateImage(file);
    if (err) {
      toast.error(err);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    onSelect?.(file);
    if (onUpload) {
      setBusy(true);
      try {
        await onUpload(file);
      } catch {
        setPreview(null);
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void handle(e.dataTransfer.files[0]);
      }}
      className={cn(
        'group relative grid h-32 w-32 shrink-0 place-items-center overflow-hidden border-2 border-dashed border-primary/30 bg-primary/5 text-primary transition hover:border-primary hover:bg-primary/10',
        shape === 'circle' ? 'rounded-full' : 'rounded-2xl',
        className,
      )}
      aria-label={label}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex flex-col items-center gap-1 px-2 text-center text-xs font-semibold">
          <Upload className="h-6 w-6" aria-hidden />
          {label}
        </span>
      )}
      {src && (
        <span className="absolute inset-0 grid place-items-center bg-slate-950/40 text-white opacity-0 transition group-hover:opacity-100">
          <Camera className="h-6 w-6" aria-hidden />
        </span>
      )}
      {busy && (
        <span className="absolute inset-0 grid place-items-center bg-slate-950/50 text-white">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        </span>
      )}
      <input
        ref={input}
        type="file"
        accept={TYPES.join(',')}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          void handle(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </button>
  );
}
