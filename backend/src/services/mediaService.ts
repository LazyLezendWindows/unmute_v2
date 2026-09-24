import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/env';
import { AppError } from '../middleware/errorHandler';

/** Public path uploaded photos are served under. */
export const MEDIA_PATH = '/api/v1/media/';
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** A stored photo's name: `<owner id>-<random id>.<ext>`, so ownership can be checked from the URL alone. */
const MEDIA_FILE = /^([0-9a-f-]{36})-[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** Identifies the image by its first bytes; the declared Content-Type is not trusted. */
function imageExtension(bytes: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export class MediaService {
  /** Stores an uploaded photo for `userId` and returns the URL to put on their profile. */
  static async savePhoto(userId: string, body: unknown): Promise<string> {
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new AppError('Choose a JPG, PNG or WebP photo to upload.', 400);
    }
    const ext = imageExtension(body);
    if (!ext) throw new AppError('Photos must be JPG, PNG or WebP images.', 415);

    const name = `${userId}-${crypto.randomUUID()}.${ext}`;
    await fs.mkdir(config.uploadDir, { recursive: true });
    await fs.writeFile(path.join(config.uploadDir, name), body, { flag: 'wx' });
    return MEDIA_PATH + name;
  }

  /** True for a URL of a photo this member uploaded (another member's upload is not theirs to use). */
  static isOwnUpload(url: string, userId: string): boolean {
    if (!url.startsWith(MEDIA_PATH)) return false;
    const match = MEDIA_FILE.exec(url.slice(MEDIA_PATH.length));
    return Boolean(match && match[1] === userId);
  }
}
