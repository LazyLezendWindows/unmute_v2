import { config } from '../config/env';
import { AppError } from '../middleware/errorHandler';

/** Scores at or above this (0–1) count as nudity. */
const NUDITY_THRESHOLD = 0.5;

/**
 * Automatic photo checks with Sightengine (SIGHTENGINE_API_USER / SIGHTENGINE_API_SECRET).
 * Photos showing nudity or sexual content are refused before they are stored. If the service is
 * not configured or does not answer, the photo is accepted and stays subject to reports and admin
 * review, so uploads never stop working because of an outside service.
 */
export class ModerationService {
  static enabled(): boolean {
    return Boolean(config.moderation.sightengineUser && config.moderation.sightengineSecret);
  }

  static async assertPhotoAllowed(image: Buffer, ext: string): Promise<void> {
    if (!this.enabled()) return;
    const verdict = await this.check(image, ext);
    if (verdict === 'nudity') {
      throw new AppError('This photo can’t be used: it looks like it shows nudity or sexual content. Please choose another.', 422);
    }
  }

  /** 'ok', 'nudity', or 'unknown' when the service couldn't be reached. */
  static async check(image: Buffer, ext: string): Promise<'ok' | 'nudity' | 'unknown'> {
    const form = new FormData();
    form.append('media', new Blob([image], { type: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg' }), `photo.${ext}`);
    form.append('models', 'nudity-2.1');
    form.append('api_user', config.moderation.sightengineUser);
    form.append('api_secret', config.moderation.sightengineSecret);
    try {
      const res = await fetch('https://api.sightengine.com/1.0/check.json', { method: 'POST', body: form, signal: AbortSignal.timeout(10_000) });
      const body: any = await res.json();
      if (body?.status !== 'success') throw new Error(body?.error?.message || `status ${res.status}`);
      const n = body.nudity ?? {};
      const score = Math.max(Number(n.sexual_activity) || 0, Number(n.sexual_display) || 0, Number(n.erotica) || 0);
      return score >= NUDITY_THRESHOLD ? 'nudity' : 'ok';
    } catch (err) {
      console.error('[Moderation] Photo check unavailable:', (err as Error).message);
      return 'unknown';
    }
  }
}
