import { z } from 'zod';
import { msg, translate } from './locale';

/** Mirrors the backend password policy so users get instant feedback. */
export const passwordSchema = z
  .string()
  .min(8, msg('At least 8 characters'))
  .regex(/[a-z]/, msg('Add a lowercase letter'))
  .regex(/[A-Z]/, msg('Add an uppercase letter'))
  .regex(/\d/, msg('Add a number'));

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, msg('Enter a valid phone number'));

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg('Pick a date'));

/** Zod's built-in messages, in the active language (messages written in schemas are translated where shown). */
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return {
        message:
          issue.received === 'undefined' || issue.received === 'null'
            ? translate('Required')
            : translate('Invalid value'),
      };
    case z.ZodIssueCode.too_small:
      if (issue.type === 'string')
        return {
          message:
            Number(issue.minimum) <= 1
              ? translate('Required')
              : translate('At least {min} characters', { min: Number(issue.minimum) }),
        };
      return { message: translate('Must be at least {min}', { min: Number(issue.minimum) }) };
    case z.ZodIssueCode.too_big:
      if (issue.type === 'string')
        return { message: translate('At most {max} characters', { max: Number(issue.maximum) }) };
      return { message: translate('Must be at most {max}', { max: Number(issue.maximum) }) };
    case z.ZodIssueCode.invalid_string:
      return {
        message: issue.validation === 'email' ? translate('Enter a valid email address') : translate('Invalid format'),
      };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: translate('Choose one of the options') };
    case z.ZodIssueCode.invalid_date:
      return { message: translate('Enter a valid date') };
    default:
      return { message: translate(ctx.defaultError) };
  }
});
