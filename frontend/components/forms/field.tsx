'use client';
import * as React from 'react';
import { Controller, type Control, type FieldError, type FieldValues, type Path } from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/misc';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Label + control + error message with proper ARIA wiring. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label?: React.ReactNode;
  htmlFor?: string;
  error?: FieldError | string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const message = typeof error === 'string' ? error : error?.message;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {required && (
            <span className="ml-0.5 text-coral" aria-hidden>
              *
            </span>
          )}
        </Label>
      )}
      {children}
      {message ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} role="alert" className="text-xs font-medium text-destructive">
          {t(message)}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export interface Option {
  value: string;
  label: string;
}

/** Radix Select bound to react-hook-form. Empty string maps to null/undefined. */
export function SelectField<T extends FieldValues>({
  control,
  name,
  options,
  placeholder = t('Select…'),
  label,
  hint,
  required,
  error,
  numeric,
  allowEmpty,
  className,
  disabled,
}: {
  control: Control<T>;
  name: Path<T>;
  options: Option[];
  placeholder?: string;
  label?: string;
  hint?: React.ReactNode;
  required?: boolean;
  error?: FieldError;
  numeric?: boolean;
  allowEmpty?: string;
  className?: string;
  disabled?: boolean;
}) {
  const id = `f-${String(name).replace(/\./g, '-')}`;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required} className={className}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select
            value={field.value === null || field.value === undefined ? '' : String(field.value)}
            onValueChange={(v) => field.onChange(v === '__none' ? null : numeric ? Number(v) : v)}
            disabled={disabled}
          >
            <SelectTrigger id={id} aria-invalid={!!error} onBlur={field.onBlur}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {allowEmpty && <SelectItem value="__none">{allowEmpty}</SelectItem>}
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </Field>
  );
}

export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
}: {
  control: Control<T>;
  name: Path<T>;
  label: string;
  description?: string;
}) {
  const id = `f-${String(name).replace(/\./g, '-')}`;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/30 p-3">
          <div>
            <label htmlFor={id} className="text-sm font-semibold">
              {label}
            </label>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          <Switch id={id} checked={!!field.value} onCheckedChange={field.onChange} />
        </div>
      )}
    />
  );
}

/** Simple standalone filter select (not bound to a form). */
export function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  allLabel = t('All'),
  className,
  ariaLabel,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  options: Option[];
  placeholder: string;
  allLabel?: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Select value={value ?? '__all'} onValueChange={(v) => onChange(v === '__all' ? undefined : v)}>
      <SelectTrigger className={cn('h-10 w-full sm:w-44', className)} aria-label={ariaLabel ?? placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
