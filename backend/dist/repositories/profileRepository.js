"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileRepository = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../config/database");
const sql_1 = require("./sql");
const distance_service_1 = require("../services/location/distance.service");
const PROFILE_COLUMNS = `p.user_id, p.id, p.display_name, p.date_of_birth, p.bio, p.approximate_location,
  p.avatar_url, p.interaction_preferences, p.is_verified,
  p.gender, p.profession, p.height_cm, p.drinking, p.smoking, p.workout, p.photos,
  p.education_level, p.profession_field, p.created_at,
  ul.place_id AS loc_place_id, ul.pincode AS loc_pincode, ul.source AS loc_source,
  ul.label_precision AS loc_precision, lp.kind AS loc_kind, lp.name AS loc_name,
  ld.name AS loc_district, ls.name AS loc_state,
  ue.institution_id AS edu_institution_id, ins.name AS edu_name, ins.short_name AS edu_short_name,
  ue.course AS edu_course, ue.start_year AS edu_start_year, ue.end_year AS edu_end_year`;
/** Joins that supply the location and education columns; every one is at most one row per profile. */
const PROFILE_JOINS = `LEFT JOIN user_locations ul ON ul.user_id = p.user_id
  LEFT JOIN places lp ON lp.id = ul.place_id
  LEFT JOIN places ld ON ld.id = lp.district_id
  LEFT JOIN places ls ON ls.id = lp.state_id
  LEFT JOIN user_education ue ON ue.user_id = p.user_id
  LEFT JOIN institutions ins ON ins.id = ue.institution_id`;
/** Escapes LIKE wildcards so a search for "50%" or "a_b" matches literally. */
function likeContains(term) {
    return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
const SEARCH_FIELDS = ['p.display_name', 'p.profession', 'p.bio', 'lp.name', 'ld.name', 'ins.name', 'ins.short_name', 'ue.course'];
class ProfileRepository {
    static findByUserId(userId) {
        return (0, database_1.getDatabase)().get(`SELECT ${PROFILE_COLUMNS} FROM profiles p ${PROFILE_JOINS} WHERE p.user_id = ?`, [
            userId,
        ]);
    }
    static async findByUserIds(userIds) {
        if (userIds.length === 0)
            return new Map();
        const rows = await (0, database_1.getDatabase)().query(`SELECT ${PROFILE_COLUMNS} FROM profiles p ${PROFILE_JOINS} WHERE p.user_id IN (${(0, sql_1.placeholders)(userIds.length)})`, userIds);
        return new Map(rows.map((r) => [r.user_id, r]));
    }
    static async insert(tx, profile) {
        const now = new Date().toISOString();
        await tx.run(`INSERT INTO profiles (
         id, user_id, display_name, date_of_birth, bio, approximate_location,
         avatar_url, interaction_preferences, is_verified, created_at, updated_at
       ) VALUES (?, ?, ?, ?, '', '', ?, '[]', 0, ?, ?)`, [crypto_1.default.randomUUID(), profile.userId, profile.displayName, profile.dateOfBirth, profile.avatarUrl || '', now, now]);
    }
    static async update(tx, userId, changes) {
        // Column names come from the typed ProfileChanges keys, never from request input.
        const entries = Object.entries(changes).filter(([, value]) => value !== undefined);
        const assignments = ['updated_at = ?', ...entries.map(([column]) => `${column} = ?`)];
        await tx.run(`UPDATE profiles SET ${assignments.join(', ')} WHERE user_id = ?`, [
            new Date().toISOString(),
            ...entries.map(([, value]) => value),
            userId,
        ]);
    }
    /**
     * Discovery candidates for `userId`: active, not yet liked/passed, no block either way, narrowed
     * by `filters`. Ranked across the whole pool (not just within a page) by shared interests, then
     * distance when the viewer has coordinates, then recency.
     */
    static findDiscoverable(userId, filters, limit, offset) {
        const origin = filters.origin ?? null;
        const distanceExpr = origin ? (0, distance_service_1.haversineSql)('ul.latitude', 'ul.longitude') : 'NULL';
        const selectParams = origin ? (0, distance_service_1.haversineParams)(origin) : [];
        const conditions = [];
        const whereParams = [];
        const where = (sql, ...params) => {
            conditions.push(sql);
            whereParams.push(...params);
        };
        if (filters.radiusKm !== undefined && origin) {
            const box = (0, distance_service_1.boundingBox)(origin, filters.radiusKm);
            where('ul.latitude BETWEEN ? AND ? AND ul.longitude BETWEEN ? AND ?', box.minLat, box.maxLat, box.minLng, box.maxLng);
            where(`${(0, distance_service_1.haversineSql)('ul.latitude', 'ul.longitude')} <= ?`, ...(0, distance_service_1.haversineParams)(origin), filters.radiusKm);
        }
        if (filters.placeId) {
            const id = filters.placeId;
            where('(lp.id = ? OR lp.parent_id = ? OR lp.district_id = ? OR lp.state_id = ?)', id, id, id, id);
        }
        if (filters.pincode)
            where('ul.pincode = ?', filters.pincode);
        if (filters.institutionId)
            where('ue.institution_id = ?', filters.institutionId);
        if (filters.bornOnOrBefore)
            where('p.date_of_birth <= ?', filters.bornOnOrBefore);
        if (filters.bornAfter)
            where('p.date_of_birth > ?', filters.bornAfter);
        if (filters.gender)
            where('p.gender = ?', filters.gender);
        if (filters.educationLevel)
            where('p.education_level = ?', filters.educationLevel);
        if (filters.professionField)
            where('p.profession_field = ?', filters.professionField);
        if (filters.verifiedOnly)
            where('p.is_verified = 1');
        if (filters.drinking)
            where('p.drinking = ?', filters.drinking);
        if (filters.smoking)
            where('p.smoking = ?', filters.smoking);
        if (filters.workout)
            where('p.workout = ?', filters.workout);
        if (filters.interestIds?.length) {
            where(`EXISTS (SELECT 1 FROM user_interests fi WHERE fi.user_id = u.id AND fi.interest_id IN (${(0, sql_1.placeholders)(filters.interestIds.length)}))`, ...filters.interestIds);
        }
        for (const term of filters.searchTerms ?? []) {
            const pattern = likeContains(term);
            where(`(${SEARCH_FIELDS.map((f) => `${f} LIKE ?`).join(' OR ')}
          OR EXISTS (SELECT 1 FROM user_interests si JOIN interests sin ON sin.id = si.interest_id
                     WHERE si.user_id = u.id AND sin.name LIKE ?))`, ...SEARCH_FIELDS.map(() => pattern), pattern);
        }
        if (filters.lookingFor?.length) {
            // Answers are stored as a JSON array of strings; each is a fixed value, so matching its quoted form is exact.
            where(`(${filters.lookingFor.map(() => 'p.interaction_preferences LIKE ?').join(' OR ')})`, ...filters.lookingFor.map((a) => `%${JSON.stringify(a)}%`));
        }
        return (0, database_1.getDatabase)().query(`SELECT ${PROFILE_COLUMNS}, COALESCE(shared.common_count, 0) AS common_count, ${distanceExpr} AS distance_km
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       ${PROFILE_JOINS}
       LEFT JOIN (
         SELECT theirs.user_id, COUNT(*) AS common_count
         FROM user_interests theirs
         JOIN user_interests mine ON mine.interest_id = theirs.interest_id AND mine.user_id = ?
         GROUP BY theirs.user_id
       ) shared ON shared.user_id = u.id
       WHERE u.id <> ?
         AND u.is_active = 1
         AND NOT EXISTS (SELECT 1 FROM likes l WHERE l.liker_id = ? AND l.likee_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM passes ps WHERE ps.passer_id = ? AND ps.passee_id = u.id)
         AND NOT ${(0, sql_1.blockedBetween)('?', 'u.id')}
         ${conditions.map((c) => `AND ${c}`).join('\n         ')}
       ORDER BY common_count DESC, distance_km IS NULL, distance_km, p.updated_at DESC, u.id
       LIMIT ? OFFSET ?`, [...selectParams, userId, userId, userId, userId, userId, userId, ...whereParams, limit, offset]);
    }
}
exports.ProfileRepository = ProfileRepository;
