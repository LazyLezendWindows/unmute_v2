import crypto from 'crypto';
import { getDatabase } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { SubscriptionService } from './subscriptionService';
import { GeocodingService } from './location/geocoding.service';
import { PlaceRepository } from '../repositories/placeRepository';
import { InteractionRepository } from '../repositories/interactionRepository';
import { Coordinates } from './location/distance.service';

/** Extras for paid plans (the free trial has the full app, but not these). */
export const FREE_SUPER_LIKES_PER_DAY = 5;
export const PREMIUM_SUPER_LIKES_PER_DAY = 25;
export const BOOST_MINUTES = 30;
/** One Boost per this many days. */
export const BOOST_EVERY_DAYS = 7;

const PREMIUM_MESSAGE = 'This is a Premium feature. Upgrade to a paid plan to use it.';

export class PremiumService {
  static async isPremium(userId: string): Promise<boolean> {
    return (await SubscriptionService.status(userId)).state === 'paid';
  }

  static async requirePremium(userId: string): Promise<void> {
    if (!(await this.isPremium(userId))) throw new AppError(PREMIUM_MESSAGE, 403);
  }

  static async superLikesPerDay(userId: string): Promise<number> {
    return (await this.isPremium(userId)) ? PREMIUM_SUPER_LIKES_PER_DAY : FREE_SUPER_LIKES_PER_DAY;
  }

  /** Everything the app needs to show premium state and allowances. */
  static async overview(userId: string) {
    const db = getDatabase();
    const [isPremium, limit, lastBoost, travel] = await Promise.all([
      this.isPremium(userId),
      this.superLikesPerDay(userId),
      db.get<{ started: number; ends: number; now: number }>(
        `SELECT TIMESTAMPDIFF(SECOND, '1970-01-01', started_at) AS started, TIMESTAMPDIFF(SECOND, '1970-01-01', ends_at) AS ends,
                TIMESTAMPDIFF(SECOND, '1970-01-01', UTC_TIMESTAMP()) AS now
         FROM boosts WHERE user_id = ? ORDER BY started_at DESC LIMIT 1`,
        [userId]
      ),
      db.get<{ place_id: string; label: string }>('SELECT place_id, label FROM travel_modes WHERE user_id = ?', [userId]),
    ]);
    const used = await InteractionRepository.countSuperLikesSince(userId, new Date(Date.now() - 86400_000).toISOString());
    const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
    const active = lastBoost && Number(lastBoost.ends) > Number(lastBoost.now);
    const nextAt = lastBoost ? Number(lastBoost.started) + BOOST_EVERY_DAYS * 86400 : null;
    return {
      isPremium,
      superLikes: { limit, usedToday: used },
      boost: {
        activeUntil: active ? iso(Number(lastBoost!.ends)) : null,
        nextAvailableAt: nextAt && nextAt > Number(lastBoost!.now) ? iso(nextAt) : null,
        minutes: BOOST_MINUTES,
      },
      travel: travel && isPremium ? { placeId: travel.place_id, label: travel.label } : null,
    };
  }

  /** Puts the member at the top of Discover for BOOST_MINUTES; once per BOOST_EVERY_DAYS. */
  static async boost(userId: string) {
    await this.requirePremium(userId);
    const db = getDatabase();
    await db.transaction(async (tx) => {
      const recent = await tx.get<{ id: string }>(
        `SELECT id FROM boosts WHERE user_id = ? AND started_at > UTC_TIMESTAMP() - INTERVAL ${BOOST_EVERY_DAYS} DAY FOR UPDATE`,
        [userId]
      );
      if (recent) throw new AppError(`You get one Boost every ${BOOST_EVERY_DAYS} days. Your next one will be ready soon.`, 429);
      await tx.run(
        `INSERT INTO boosts (id, user_id, started_at, ends_at) VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL ${BOOST_MINUTES} MINUTE)`,
        [crypto.randomUUID(), userId]
      );
    });
    return this.overview(userId);
  }

  /** Travel mode: Discover searches around another town or city. */
  static async setTravel(userId: string, placeId: string) {
    await this.requirePremium(userId);
    const place = await GeocodingService.requirePlace(placeId);
    if (place.kind === 'state') throw new AppError('Choose a city, town or district rather than a whole state.', 400);
    const coords = await PlaceRepository.coordinatesFor(place);
    if (!coords) throw new AppError('We don’t have a map position for that place yet. Try a nearby city.', 400);
    const label = [place.name, place.state_name].filter(Boolean).join(', ').slice(0, 160);
    await getDatabase().run(
      `INSERT INTO travel_modes (user_id, place_id, label, latitude, longitude, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE place_id = VALUES(place_id), label = VALUES(label), latitude = VALUES(latitude), longitude = VALUES(longitude), created_at = VALUES(created_at)`,
      [userId, place.id, label, coords.latitude, coords.longitude]
    );
    return this.overview(userId);
  }

  static async clearTravel(userId: string) {
    await getDatabase().run('DELETE FROM travel_modes WHERE user_id = ?', [userId]);
    return this.overview(userId);
  }

  /** Where Discover searches from while travelling (paid plans only), or null. */
  static async travelOrigin(userId: string): Promise<Coordinates | null> {
    const row = await getDatabase().get<{ latitude: string; longitude: string }>('SELECT latitude, longitude FROM travel_modes WHERE user_id = ?', [userId]);
    if (!row || !(await this.isPremium(userId))) return null;
    return { latitude: Number(row.latitude), longitude: Number(row.longitude) };
  }
}
