import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { badRequest } from '../utils/errors';
import { uploadRoot } from '../utils/files';
import { t } from '../i18n';

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/** Checks magic bytes so a renamed non-image can't slip through on its MIME header alone. */
function looksLikeImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const hex = buf.subarray(0, 12).toString('hex');
  return (
    hex.startsWith('ffd8ff') || // jpeg
    hex.startsWith('89504e470d0a1a0a') || // png
    hex.startsWith('47494638') || // gif
    (hex.startsWith('52494646') && buf.subarray(8, 12).toString('ascii') === 'WEBP')
  );
}

export type UploadFolder = 'students' | 'activities' | 'books' | 'inventory' | 'avatars' | 'school';

function storage(folder: UploadFolder) {
  const dir = path.join(uploadRoot, folder);
  fs.mkdirSync(dir, { recursive: true });
  return multer.diskStorage({
    destination: dir,
    // Never trust the client filename: generate a random name with an extension from the MIME type.
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${IMAGE_TYPES[file.mimetype]}`),
  });
}

function imageUploader(folder: UploadFolder) {
  return multer({
    storage: storage(folder),
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 10 },
    fileFilter: (_req, file, cb) => {
      if (IMAGE_TYPES[file.mimetype]) cb(null, true);
      else cb(badRequest('Only JPEG, PNG, WEBP or GIF images are allowed'));
    },
  });
}

async function verifyFiles(files: Express.Multer.File[]): Promise<void> {
  for (const f of files) {
    const handle = await fs.promises.open(f.path, 'r');
    const buf = Buffer.alloc(12);
    await handle.read(buf, 0, 12, 0);
    await handle.close();
    if (!looksLikeImage(buf)) {
      await Promise.all(files.map((x) => fs.promises.unlink(x.path).catch(() => undefined)));
      throw badRequest(t('File "{name}" is not a valid image', { name: f.originalname }));
    }
  }
}

function wrap(mw: ReturnType<ReturnType<typeof imageUploader>['single']>) {
  return (req: Request, res: Response, next: NextFunction) =>
    mw(req, res, async (err?: unknown) => {
      if (err) return next(err instanceof multer.MulterError ? badRequest(uploadMessage(err)) : err);
      try {
        const files = req.file ? [req.file] : Array.isArray(req.files) ? req.files : [];
        await verifyFiles(files);
        next();
      } catch (e) {
        next(e);
      }
    });
}

function uploadMessage(err: multer.MulterError): string {
  if (err.code === 'LIMIT_FILE_SIZE') return t('File too large (max {size} MB)', { size: env.MAX_UPLOAD_MB });
  if (err.code === 'LIMIT_FILE_COUNT') return t('Too many files');
  return err.message;
}

export const uploadImage = (folder: UploadFolder, field = 'file') =>
  wrap(imageUploader(folder).single(field));
export const uploadImages = (folder: UploadFolder, field = 'files', max = 10) =>
  wrap(imageUploader(folder).array(field, max));

export const toPublicUrl = (folder: UploadFolder, file: Express.Multer.File) =>
  `/uploads/${folder}/${file.filename}`;

/** In-memory upload for spreadsheet imports. */
export const uploadSpreadsheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.originalname.toLowerCase().endsWith('.xlsx');
    if (ok) cb(null, true);
    else cb(badRequest('Please upload an .xlsx file'));
  },
}).single('file');
