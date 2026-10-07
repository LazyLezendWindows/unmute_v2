import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { ModerationService } from './moderationService';

/** Public path uploaded photos are served under. */
export const MEDIA_PATH = '/api/v1/media/';
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** About three minutes of voice at typical browser recording quality. */
export const MAX_VOICE_BYTES = 3 * 1024 * 1024;

/** A stored photo's name: `<owner id>-<random id>.<ext>`, so ownership can be checked from the URL alone. */
const MEDIA_FILE = /^([0-9a-f-]{36})-[0-9a-f-]{36}\.(jpg|png|webp|webm|ogg|m4a)$/;
const PHOTO_EXTS = ['jpg', 'png', 'webp'];
const VOICE_EXTS = ['webm', 'ogg', 'm4a'];

/** Identifies a voice recording by its first bytes (Chrome/Firefox record WebM or Ogg, Safari MP4). */
function audioExtension(bytes: Buffer): 'webm' | 'ogg' | 'm4a' | null {
  if (bytes.length > 4 && bytes.readUInt32BE(0) === 0x1a45dfa3) return 'webm';
  if (bytes.length > 4 && bytes.toString('ascii', 0, 4) === 'OggS') return 'ogg';
  if (bytes.length > 12 && bytes.toString('ascii', 4, 8) === 'ftyp') return 'm4a';
  return null;
}

/** Identifies the image by its first bytes; the declared Content-Type is not trusted. */
export function imageExtension(bytes: Buffer): 'jpg' | 'png' | 'webp' | null {
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
    await ModerationService.assertPhotoAllowed(body, ext);

    const name = `${userId}-${crypto.randomUUID()}.${ext}`;
    await fs.mkdir(config.uploadDir, { recursive: true });
    await fs.writeFile(path.join(config.uploadDir, name), body, { flag: 'wx' });
    return MEDIA_PATH + name;
  }

  /** Stores a recorded voice message for `userId` and returns its URL. */
  static async saveVoice(userId: string, body: unknown): Promise<string> {
    if (!Buffer.isBuffer(body) || body.length === 0) throw new AppError('The recording was empty. Please try again.', 400);
    const ext = audioExtension(body);
    if (!ext) throw new AppError('That recording format isn\'t supported.', 415);
    const name = `${userId}-${crypto.randomUUID()}.${ext}`;
    await fs.mkdir(config.uploadDir, { recursive: true });
    await fs.writeFile(path.join(config.uploadDir, name), body, { flag: 'wx' });
    return MEDIA_PATH + name;
  }

  /** True when `url` is this member's own upload of the given kind (for photo and voice messages). */
  static isOwnUploadOfKind(url: string, userId: string, kind: 'image' | 'voice'): boolean {
    if (!this.isOwnUpload(url, userId)) return false;
    const ext = url.split('.').pop()!;
    return (kind === 'image' ? PHOTO_EXTS : VOICE_EXTS).includes(ext);
  }

  /** True for a URL of a photo this member uploaded (another member's upload is not theirs to use). */
  static isOwnUpload(url: string, userId: string): boolean {
    if (!url.startsWith(MEDIA_PATH)) return false;
    const match = MEDIA_FILE.exec(url.slice(MEDIA_PATH.length));
    return Boolean(match && match[1] === userId);
  }
}
