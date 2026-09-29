"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePreferences = parsePreferences;
exports.parsePhotos = parsePhotos;
exports.toOwnProfile = toOwnProfile;
exports.toPublicProfile = toPublicProfile;
const age_1 = require("../utils/age");
const locationMapper_1 = require("./locationMapper");
const presence_1 = require("../sockets/presence");
function parsePreferences(raw) {
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function parsePhotos(raw) {
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed.filter((url) => typeof url === 'string') : [];
    }
    catch {
        return [];
    }
}
/** Work, height, lifestyle and photos: shown to others and to the owner alike. */
function profileDetails(row) {
    return {
        profession: row?.profession || '',
        heightCm: row?.height_cm ?? null,
        educationLevel: row?.education_level ?? null,
        professionField: row?.profession_field ?? null,
        lifestyle: { drinking: row?.drinking ?? null, smoking: row?.smoking ?? null, workout: row?.workout ?? null },
        photos: parsePhotos(row?.photos),
    };
}
/**
 * The area other members see: derived from the structured location at the member's chosen
 * precision, else the legacy free-text location from before structured locations existed.
 */
function publicArea(row) {
    if (row.loc_kind && row.loc_name) {
        return (0, locationMapper_1.locationLabel)({ kind: row.loc_kind, name: row.loc_name, districtName: row.loc_district, stateName: row.loc_state }, row.loc_precision || 'city');
    }
    return row.approximate_location || '';
}
function publicEducation(row) {
    if (!row?.edu_institution_id || !row.edu_name)
        return null;
    return { institutionName: row.edu_name, institutionShortName: row.edu_short_name || '', course: row.edu_course || '' };
}
/** The member's own location settings. Coordinates are never included, not even for the owner. */
function ownLocation(row) {
    if (!row.loc_source)
        return null;
    return {
        placeId: row.loc_place_id,
        placeName: row.loc_name || '',
        placeKind: row.loc_kind,
        pincode: row.loc_pincode,
        source: row.loc_source,
        precision: row.loc_precision || 'city',
        label: publicArea(row),
    };
}
function ownEducation(row) {
    if (!row.edu_institution_id)
        return null;
    return {
        institutionId: row.edu_institution_id,
        institutionName: row.edu_name || '',
        institutionShortName: row.edu_short_name || '',
        course: row.edu_course || '',
        startYear: row.edu_start_year,
        endYear: row.edu_end_year,
    };
}
/** The signed-in user's own profile, including private fields such as date of birth. */
function toOwnProfile(row, interests) {
    return {
        id: row.id,
        displayName: row.display_name,
        dateOfBirth: row.date_of_birth,
        age: (0, age_1.calculateAge)(row.date_of_birth),
        bio: row.bio || '',
        approximateLocation: publicArea(row),
        location: ownLocation(row),
        education: ownEducation(row),
        avatarUrl: row.avatar_url || '',
        interactionPreferences: parsePreferences(row.interaction_preferences),
        interests,
        isVerified: Boolean(row.is_verified),
        gender: row.gender,
        ...profileDetails(row),
    };
}
/** What other members may see about a user: never email, date of birth, PIN code or coordinates. */
function toPublicProfile(userId, row) {
    return {
        id: userId,
        displayName: row?.display_name || 'Connection',
        age: row ? (0, age_1.calculateAge)(row.date_of_birth) : 18,
        bio: row?.bio || '',
        approximateLocation: row ? publicArea(row) : '',
        avatarUrl: row?.avatar_url || '',
        isVerified: Boolean(row?.is_verified),
        education: publicEducation(row),
        ...profileDetails(row),
        isOnline: (0, presence_1.isOnline)(userId),
    };
}
