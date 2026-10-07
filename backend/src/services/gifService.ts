import { config } from '../config/env';
import { AppError } from '../middleware/errorHandler';

export interface Gif {
  id: string;
  /** Sent in the message (Giphy's media link). */
  url: string;
  /** A smaller version for the picker. */
  previewUrl: string;
  width: number;
  height: number;
  title: string;
}

/** Only Giphy's media links can be sent as GIF messages. */
const GIPHY_MEDIA = /^https:\/\/media\d?\.giphy\.com\/media\/[A-Za-z0-9]+\/[A-Za-z0-9_.-]+\.(gif|webp)$/;

export class GifService {
  static enabled(): boolean {
    return Boolean(config.giphyApiKey);
  }

  static isGifUrl(url: string): boolean {
    return GIPHY_MEDIA.test(url);
  }

  /** Search (or, with no words, trending), proxied so the API key stays on the server. */
  static async search(query: string, limit = 24): Promise<Gif[]> {
    if (!this.enabled()) throw new AppError('GIFs are not available.', 503);
    const params = new URLSearchParams({ api_key: config.giphyApiKey, limit: String(limit), rating: 'pg-13' });
    const endpoint = query.trim() ? 'search' : 'trending';
    if (query.trim()) params.set('q', query.trim());
    let body: any;
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/${endpoint}?${params}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Giphy ${res.status}`);
      body = await res.json();
    } catch (err) {
      console.error('[GIFs] Search failed:', (err as Error).message);
      throw new AppError('Couldn’t load GIFs right now. Try again.', 502);
    }
    const strip = (u: string | undefined) => (u ? u.split('?')[0] : '');
    return (body?.data ?? [])
      .map((g: any): Gif => ({
        id: String(g.id),
        url: strip(g.images?.fixed_height?.webp || g.images?.fixed_height?.url),
        previewUrl: strip(g.images?.fixed_height_small?.webp || g.images?.fixed_height_small?.url || g.images?.fixed_height?.url),
        width: Number(g.images?.fixed_height?.width) || 200,
        height: Number(g.images?.fixed_height?.height) || 200,
        title: String(g.title || 'GIF').slice(0, 100),
      }))
      .filter((g: Gif) => this.isGifUrl(g.url) && g.previewUrl);
  }
}
