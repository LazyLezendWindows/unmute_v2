import { api } from './api';
import { API_BASE_URL } from '../config';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Where to load a profile photo from. Uploaded photos are stored as `/api/v1/media/…`, which the
 * web app can load as is; the mobile apps talk to an absolute API address, so it is put in front.
 */
export function mediaUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('/api/v1/') && /^https?:\/\//i.test(API_BASE_URL)) {
    return API_BASE_URL.replace(/\/api\/v1\/?$/, '') + url;
  }
  return url;
}

/** A photo as a CSS background (cards and tiles), or nothing when there is no photo. */
export function photoBackground(url: string | null | undefined): Record<string, string> {
  const src = mediaUrl(url);
  return src ? { backgroundImage: `url("${src.replace(/"/g, '%22')}")` } : {};
}

/** Checks a picked file before sending it; returns the reason it can't be used, or null. */
export function photoProblem(file: File): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return 'Photos must be JPG, PNG or WebP images.';
  if (file.size > MAX_PHOTO_BYTES) return 'Photos must be 5 MB or smaller.';
  return null;
}

/** Uploads the file itself (no form encoding) and returns the URL to save on the profile. */
export async function uploadPhoto(file: File): Promise<string> {
  const res = await api.post('/users/me/photos', file, { headers: { 'Content-Type': file.type } });
  return res.data.data.url;
}

/** Main photo first, then the gallery; empty links dropped. */
export function photosOf(person: { avatarUrl?: string; photos?: string[] }): string[] {
  return [person.avatarUrl || '', ...(person.photos || [])].filter(Boolean);
}
