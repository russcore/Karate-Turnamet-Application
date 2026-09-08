import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

export async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(config.uploadDir, { recursive: true });
}

/** Persist an uploaded buffer to the uploads dir, returning its public URL path. */
export async function saveUpload(buffer: Buffer, originalName: string): Promise<string> {
  await ensureUploadDir();
  const ext = (path.extname(originalName) || '.bin').toLowerCase().replace(/[^.a-z0-9]/g, '');
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  await fs.writeFile(path.join(config.uploadDir, name), buffer);
  return `/uploads/${name}`;
}
