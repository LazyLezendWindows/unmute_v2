import crypto from 'crypto';
import { getDatabase, IDatabase } from '../config/database';
import { ProfileRow } from '../mappers/profileMapper';
import { freeEndSql } from '../services/subscriptionService';
import { placeholders, blockedBetween } from './sql';
import { Coordinates, boundingBox, haversineParams, haversineSql } from '../services/location/distance.service';

const PROFILE_COLUMNS = `p.user_id, p.id, p.display_name, p.date_of_birth, p.bio, p.approximate_location,
  p.avatar_url, p.interaction_preferences, p.is_verified,
  p.gender, p.profession, p.height_cm, p.drinking, p.smoking, p.workout, p.photos,
  p.education_level, p.profession_field, p.created_at,
  p.prompts, p.religion, p.mother_tongue, p.languages, p.diet, p.marital_status, p.family_plans,
  EXISTS (SELECT 1 FROM subscriptions sp WHERE sp.user_id = p.user_id AND sp.plan_expires_at > UTC_TIMESTAMP() AND sp.plan_started_at <= UTC_TIMESTAMP()) AS is_premium,
  (SELECT spp.plan FROM subscriptions spp WHERE spp.user_id = p.user_id AND spp.plan_expires_at > UTC_TIMESTAMP() AND spp.plan_started_at <= UTC_TIMESTAMP()) AS premium_plan,
  (SELECT tm.label FROM travel_modes tm JOIN subscriptions st ON st.user_id = tm.user_id AND st.plan_expires_at > UTC_TIMESTAMP() AND st.plan_started_at <= UTC_TIMESTAMP()
   WHERE tm.user_id = p.user_id) AS travel_label,
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

/** Backend-enforced discovery filters; every field is optional and they combine with AND. */
export interface DiscoverFilters {
  /** The viewer's own (already coarsened) coordinates; enables distances and the radius filter. */
  origin?: Coordinates | null;
  radiusKm?: number;
  /** Matches members whose area is this place or anywhere inside it (district, state, …). */
  placeId?: string;
  pincode?: string;
  institutionId?: string;
  /** ISO dates derived from an age range: `date_of_birth <= bornOnOrBefore` and `> bornAfter`. */
  bornOnOrBefore?: string;
  bornAfter?: string;
  gender?: string;
  /** Anyone sharing at least one of these interests. */
  interestIds?: string[];
  /** Anyone whose "looking for" includes at least one of these answers. */
  lookingFor?: readonly string[];
  educationLevel?: string;
  professionField?: string;
  verifiedOnly?: boolean;
  drinking?: string;
  smoking?: string;
  workout?: string;
  religion?: string;
  /** Anyone whose mother tongue or spoken languages include this one. */
  language?: string;
  diet?: string;
  maritalStatus?: string;
  /** Search words; each must appear in the name, work, bio, an interest, the college or the area. */
  searchTerms?: string[];
}

/** Escapes LIKE wildcards so a search for "50%" or "a_b" matches literally. */
function likeContains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const SEARCH_FIELDS = ['p.display_name', 'p.profession', 'p.bio', 'lp.name', 'ld.name', 'ins.name', 'ins.short_name', 'ue.course'];

export type DiscoverableRow = ProfileRow & { common_count: number; distance_km: number | null };

/** Updatable profile columns, keyed by column name. */
export interface ProfileChanges {
  display_name?: string;
  bio?: string;
  approximate_location?: string;
  avatar_url?: string;
  interaction_preferences?: string;
  gender?: string | null;
  profession?: string;
  height_cm?: number | null;
  drinking?: string | null;
  smoking?: string | null;
  workout?: string | null;
  photos?: string;
  education_level?: string | null;
  profession_field?: string | null;
  prompts?: string;
  religion?: string | null;
  mother_tongue?: string | null;
  languages?: string;
  diet?: string | null;
  marital_status?: string | null;
  family_plans?: string | null;
}

export class ProfileRepository {
  static findByUserId(userId: string): Promise<ProfileRow | null> {
    return getDatabase().get(`SELECT ${PROFILE_COLUMNS} FROM profiles p ${PROFILE_JOINS} WHERE p.user_id = ?`, [
      userId,
    ]);
  }

  static async findByUserIds(userIds: string[]): Promise<Map<string, ProfileRow>> {
    if (userIds.length === 0) return new Map();
    const rows = await getDatabase().query<ProfileRow>(
      `SELECT ${PROFILE_COLUMNS} FROM profiles p ${PROFILE_JOINS} WHERE p.user_id IN (${placeholders(userIds.length)})`,
      userIds
    );
    return new Map(rows.map((r) => [r.user_id, r]));
  }

  static async insert(
    tx: IDatabase,
    profile: { userId: string; displayName: string; dateOfBirth: string; avatarUrl?: string }
  ): Promise<void> {
    const now = new Date().toISOString();
    await tx.run(
      `INSERT INTO profiles (
         id, user_id, display_name, date_of_birth, bio, approximate_location,
         avatar_url, interaction_preferences, is_verified, created_at, updated_at
       ) VALUES (?, ?, ?, ?, '', '', ?, '[]', 0, ?, ?)`,
      [crypto.randomUUID(), profile.userId, profile.displayName, profile.dateOfBirth, profile.avatarUrl || '', now, now]
    );
  }

  static async update(tx: IDatabase, userId: string, changes: ProfileChanges): Promise<void> {
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
  static findDiscoverable(
    userId: string,
    filters: DiscoverFilters,
    limit: number,
    offset: number
  ): Promise<DiscoverableRow[]> {
    const origin = filters.origin ?? null;
    const distanceExpr = origin ? haversineSql('ul.latitude', 'ul.longitude') : 'NULL';
    const selectParams: unknown[] = origin ? haversineParams(origin) : [];

    const conditions: string[] = [];
    const whereParams: unknown[] = [];
    const where = (sql: string, ...params: unknown[]) => {
      conditions.push(sql);
      whereParams.push(...params);
    };

    if (filters.radiusKm !== undefined && origin) {
      const box = boundingBox(origin, filters.radiusKm);
      where('ul.latitude BETWEEN ? AND ? AND ul.longitude BETWEEN ? AND ?', box.minLat, box.maxLat, box.minLng, box.maxLng);
      where(`${haversineSql('ul.latitude', 'ul.longitude')} <= ?`, ...haversineParams(origin), filters.radiusKm);
    }
    if (filters.placeId) {
      const id = filters.placeId;
      where('(lp.id = ? OR lp.parent_id = ? OR lp.district_id = ? OR lp.state_id = ?)', id, id, id, id);
    }
    if (filters.pincode) where('ul.pincode = ?', filters.pincode);
    if (filters.institutionId) where('ue.institution_id = ?', filters.institutionId);
    if (filters.bornOnOrBefore) where('p.date_of_birth <= ?', filters.bornOnOrBefore);
    if (filters.bornAfter) where('p.date_of_birth > ?', filters.bornAfter);
    if (filters.gender) where('p.gender = ?', filters.gender);
    if (filters.educationLevel) where('p.education_level = ?', filters.educationLevel);
    if (filters.professionField) where('p.profession_field = ?', filters.professionField);
    if (filters.verifiedOnly) where('p.is_verified = 1');
    if (filters.drinking) where('p.drinking = ?', filters.drinking);
    if (filters.smoking) where('p.smoking = ?', filters.smoking);
    if (filters.workout) where('p.workout = ?', filters.workout);
    if (filters.religion) where('p.religion = ?', filters.religion);
    if (filters.language) where('(p.mother_tongue = ? OR p.languages LIKE ?)', filters.language, `%${JSON.stringify(filters.language)}%`);
    if (filters.diet) where('p.diet = ?', filters.diet);
    if (filters.maritalStatus) where('p.marital_status = ?', filters.maritalStatus);
    if (filters.interestIds?.length) {
      where(
        `EXISTS (SELECT 1 FROM user_interests fi WHERE fi.user_id = u.id AND fi.interest_id IN (${placeholders(filters.interestIds.length)}))`,
        ...filters.interestIds
      );
    }
    for (const term of filters.searchTerms ?? []) {
      const pattern = likeContains(term);
      where(
        `(${SEARCH_FIELDS.map((f) => `${f} LIKE ?`).join(' OR ')}
          OR EXISTS (SELECT 1 FROM user_interests si JOIN interests sin ON sin.id = si.interest_id
                     WHERE si.user_id = u.id AND sin.name LIKE ?))`,
        ...SEARCH_FIELDS.map(() => pattern),
        pattern
      );
    }
    if (filters.lookingFor?.length) {
      // Answers are stored as a JSON array of strings; each is a fixed value, so matching its quoted form is exact.
      where(`(${filters.lookingFor.map(() => 'p.interaction_preferences LIKE ?').join(' OR ')})`, ...filters.lookingFor.map((a) => `%${JSON.stringify(a)}%`));
    }

    return getDatabase().query(
      `SELECT ${PROFILE_COLUMNS}, COALESCE(shared.common_count, 0) AS common_count, ${distanceExpr} AS distance_km
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
         AND u.paused_at IS NULL
         -- Only members who can use the app (trial, plan or referral time left) are shown.
         AND EXISTS (
           SELECT 1 FROM subscriptions sa WHERE sa.user_id = u.id
             AND GREATEST(${freeEndSql('sa.')}, COALESCE(sa.plan_expires_at, sa.trial_started_at)) > UTC_TIMESTAMP()
         )
         AND NOT EXISTS (SELECT 1 FROM likes l WHERE l.liker_id = ? AND l.likee_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM passes ps WHERE ps.passer_id = ? AND ps.passee_id = u.id)
         AND NOT ${blockedBetween('?', 'u.id')}
         ${conditions.map((c) => `AND ${c}`).join('\n         ')}
       ORDER BY EXISTS (SELECT 1 FROM boosts bo WHERE bo.user_id = u.id AND bo.ends_at > UTC_TIMESTAMP()) DESC,
                common_count DESC, distance_km IS NULL, distance_km, p.updated_at DESC, u.id
       LIMIT ? OFFSET ?`,
      [...selectParams, userId, userId, userId, userId, userId, userId, ...whereParams, limit, offset]
    );
  }
}
