import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../config/logger';

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!env.SMTP_HOST) {
    logger.info({ to, subject }, `[mail disabled] ${text}`);
    if (!env.isTest) console.log(`\n=== EMAIL to ${to}: ${subject} ===\n${text}\n`);
    return;
  }
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
}
