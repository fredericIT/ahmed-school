import { z, ZodIssueCode } from 'zod';
import { t } from '.';

/**
 * Zod's built-in messages, in the request's language. Messages written in the schemas are English keys
 * translated by the error handler.
 */
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      return {
        message:
          issue.received === 'undefined' || issue.received === 'null' ? t('Required') : t('Invalid value'),
      };
    case ZodIssueCode.too_small:
      if (issue.type === 'string')
        return {
          message:
            Number(issue.minimum) <= 1
              ? t('Required')
              : t('At least {min} characters', { min: Number(issue.minimum) }),
        };
      if (issue.type === 'array')
        return { message: t('Choose at least {min}', { min: Number(issue.minimum) }) };
      return { message: t('Must be at least {min}', { min: Number(issue.minimum) }) };
    case ZodIssueCode.too_big:
      if (issue.type === 'string')
        return { message: t('At most {max} characters', { max: Number(issue.maximum) }) };
      if (issue.type === 'array')
        return { message: t('Choose at most {max}', { max: Number(issue.maximum) }) };
      return { message: t('Must be at most {max}', { max: Number(issue.maximum) }) };
    case ZodIssueCode.invalid_string:
      return {
        message: issue.validation === 'email' ? t('Enter a valid email address') : t('Invalid format'),
      };
    case ZodIssueCode.invalid_enum_value:
      return { message: t('Choose one of the options') };
    case ZodIssueCode.invalid_date:
      return { message: t('Enter a valid date') };
    case ZodIssueCode.not_multiple_of:
      return { message: t('Invalid value') };
    default:
      return { message: t(ctx.defaultError) };
  }
});
