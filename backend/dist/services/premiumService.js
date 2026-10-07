"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PremiumService = exports.BOOST_EVERY_DAYS = exports.BOOST_MINUTES = exports.PREMIUM_SUPER_LIKES_PER_DAY = exports.FREE_SUPER_LIKES_PER_DAY = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../config/database");
const errorHandler_1 = require("../middleware/errorHandler");
const subscriptionService_1 = require("./subscriptionService");
const geocoding_service_1 = require("./location/geocoding.service");
const placeRepository_1 = require("../repositories/placeRepository");
const interactionRepository_1 = require("../repositories/interactionRepository");
/** Extras for paid plans (the free trial has the full app, but not these). */
exports.FREE_SUPER_LIKES_PER_DAY = 5;
exports.PREMIUM_SUPER_LIKES_PER_DAY = 25;
exports.BOOST_MINUTES = 30;
/** One Boost per this many days. */
exports.BOOST_EVERY_DAYS = 7;
const PREMIUM_MESSAGE = 'This is a Premium feature. Upgrade to a paid plan to use it.';
class PremiumService {
    static async isPremium(userId) {
        return (await subscriptionService_1.SubscriptionService.status(userId)).state === 'paid';
    }
    static async requirePremium(userId) {
        if (!(await this.isPremium(userId)))
            throw new errorHandler_1.AppError(PREMIUM_MESSAGE, 403);
    }
    static async superLikesPerDay(userId) {
        return (await this.isPremium(userId)) ? exports.PREMIUM_SUPER_LIKES_PER_DAY : exports.FREE_SUPER_LIKES_PER_DAY;
    }
    /** Everything the app needs to show premium state and allowances. */
    static async overview(userId) {
        const db = (0, database_1.getDatabase)();
        const [isPremium, limit, lastBoost, travel] = await Promise.all([
            this.isPremium(userId),
            this.superLikesPerDay(userId),
            db.get(`SELECT TIMESTAMPDIFF(SECOND, '1970-01-01', started_at) AS started, TIMESTAMPDIFF(SECOND, '1970-01-01', ends_at) AS ends,
                TIMESTAMPDIFF(SECOND, '1970-01-01', UTC_TIMESTAMP()) AS now
         FROM boosts WHERE user_id = ? ORDER BY started_at DESC LIMIT 1`, [userId]),
            db.get('SELECT place_id, label FROM travel_modes WHERE user_id = ?', [userId]),
        ]);
        const used = await interactionRepository_1.InteractionRepository.countSuperLikesSince(userId, new Date(Date.now() - 86400_000).toISOString());
        const iso = (seconds) => new Date(seconds * 1000).toISOString();
        const active = lastBoost && Number(lastBoost.ends) > Number(lastBoost.now);
        const nextAt = lastBoost ? Number(lastBoost.started) + exports.BOOST_EVERY_DAYS * 86400 : null;
        return {
            isPremium,
            superLikes: { limit, usedToday: used },
            boost: {
                activeUntil: active ? iso(Number(lastBoost.ends)) : null,
                nextAvailableAt: nextAt && nextAt > Number(lastBoost.now) ? iso(nextAt) : null,
                minutes: exports.BOOST_MINUTES,
            },
            travel: travel && isPremium ? { placeId: travel.place_id, label: travel.label } : null,
        };
    }
    /** Puts the member at the top of Discover for BOOST_MINUTES; once per BOOST_EVERY_DAYS. */
    static async boost(userId) {
        await this.requirePremium(userId);
        const db = (0, database_1.getDatabase)();
        await db.transaction(async (tx) => {
            const recent = await tx.get(`SELECT id FROM boosts WHERE user_id = ? AND started_at > UTC_TIMESTAMP() - INTERVAL ${exports.BOOST_EVERY_DAYS} DAY FOR UPDATE`, [userId]);
            if (recent)
                throw new errorHandler_1.AppError(`You get one Boost every ${exports.BOOST_EVERY_DAYS} days. Your next one will be ready soon.`, 429);
            await tx.run(`INSERT INTO boosts (id, user_id, started_at, ends_at) VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL ${exports.BOOST_MINUTES} MINUTE)`, [crypto_1.default.randomUUID(), userId]);
        });
        return this.overview(userId);
    }
    /** Travel mode: Discover searches around another town or city. */
    static async setTravel(userId, placeId) {
        await this.requirePremium(userId);
        const place = await geocoding_service_1.GeocodingService.requirePlace(placeId);
        if (place.kind === 'state')
            throw new errorHandler_1.AppError('Choose a city, town or district rather than a whole state.', 400);
        const coords = await placeRepository_1.PlaceRepository.coordinatesFor(place);
        if (!coords)
            throw new errorHandler_1.AppError('We don’t have a map position for that place yet. Try a nearby city.', 400);
        const label = [place.name, place.state_name].filter(Boolean).join(', ').slice(0, 160);
        await (0, database_1.getDatabase)().run(`INSERT INTO travel_modes (user_id, place_id, label, latitude, longitude, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE place_id = VALUES(place_id), label = VALUES(label), latitude = VALUES(latitude), longitude = VALUES(longitude), created_at = VALUES(created_at)`, [userId, place.id, label, coords.latitude, coords.longitude]);
        return this.overview(userId);
    }
    static async clearTravel(userId) {
        await (0, database_1.getDatabase)().run('DELETE FROM travel_modes WHERE user_id = ?', [userId]);
        return this.overview(userId);
    }
    /** Where Discover searches from while travelling (paid plans only), or null. */
    static async travelOrigin(userId) {
        const row = await (0, database_1.getDatabase)().get('SELECT latitude, longitude FROM travel_modes WHERE user_id = ?', [userId]);
        if (!row || !(await this.isPremium(userId)))
            return null;
        return { latitude: Number(row.latitude), longitude: Number(row.longitude) };
    }
}
exports.PremiumService = PremiumService;
