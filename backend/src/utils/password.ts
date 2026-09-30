import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { msg } from '../i18n';

const ROUNDS = 12;

export const passwordSchema = z
  .string()
  .min(8, msg('Password must be at least 8 characters'))
  .max(100)
  .regex(/[a-z]/, msg('Password must contain a lowercase letter'))
  .regex(/[A-Z]/, msg('Password must contain an uppercase letter'))
  .regex(/\d/, msg('Password must contain a number'));

export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
