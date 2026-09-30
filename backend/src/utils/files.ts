import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

export const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);

/** Converts a public URL like /uploads/students/x.jpg to an absolute file path, or null if outside uploads. */
export function publicUrlToPath(url: string | null | undefined): string | null {
  if (!url || !url.startsWith('/uploads/')) return null;
  const abs = path.resolve(uploadRoot, url.replace(/^\/uploads\//, ''));
  return abs.startsWith(uploadRoot) ? abs : null;
}

export function removeUpload(url: string | null | undefined): void {
  const p = publicUrlToPath(url);
  if (p) fs.promises.unlink(p).catch(() => undefined);
}
