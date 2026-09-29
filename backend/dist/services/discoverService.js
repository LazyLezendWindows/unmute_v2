"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscoverService = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const profileMapper_1 = require("../mappers/profileMapper");
const profileRepository_1 = require("../repositories/profileRepository");
const interestRepository_1 = require("../repositories/interestRepository");
const discoverValidator_1 = require("../validators/discoverValidator");
const distance_service_1 = require("./location/distance.service");
const geolocation_service_1 = require("./location/geolocation.service");
const educationService_1 = require("./educationService");
/** `YYYY-MM-DD` for today minus `years`, in UTC. */
function yearsAgo(years) {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - years);
    return d.toISOString().slice(0, 10);
}
class DiscoverService {
    /** Turns validated query options into repository filters, resolving anything relative to the viewer. */
    static async resolveFilters(viewerId, query) {
        const origin = await geolocation_service_1.UserLocationService.originFor(viewerId);
        if (query.radiusKm !== undefined && !origin) {
            throw new errorHandler_1.AppError('Set your area on your profile to filter by distance.', 400);
        }
        let institutionId = query.institutionId;
        if (query.sameInstitution) {
            institutionId = (await educationService_1.EducationService.institutionIdFor(viewerId)) ?? undefined;
            if (!institutionId) {
                throw new errorHandler_1.AppError('Add your college to your profile to find people from it.', 400);
            }
        }
        return {
            origin,
            radiusKm: query.radiusKm,
            placeId: query.placeId,
            pincode: query.pincode,
            institutionId,
            // Age a ⇔ born on or before (today − a years); age ≤ b ⇔ born after (today − (b+1) years).
            bornOnOrBefore: query.minAge !== undefined ? yearsAgo(query.minAge) : undefined,
            bornAfter: query.maxAge !== undefined ? yearsAgo(query.maxAge + 1) : undefined,
            gender: query.showMe === 'women' ? 'woman' : query.showMe === 'men' ? 'man' : undefined,
            interestIds: query.interestIds,
            educationLevel: query.educationLevel,
            professionField: query.professionField,
            verifiedOnly: query.verifiedOnly,
            drinking: query.drinking,
            smoking: query.smoking,
            workout: query.workout,
            lookingFor: query.lookingFor ? discoverValidator_1.LOOKING_FOR_GROUPS[query.lookingFor] : undefined,
            searchTerms: query.q?.length ? query.q : undefined,
        };
    }
    static async getFeed(currentUserId, query = {}) {
        const filters = await this.resolveFilters(currentUserId, query);
        const candidates = await profileRepository_1.ProfileRepository.findDiscoverable(currentUserId, filters, query.limit ?? 20, query.offset ?? 0);
        const interestsByUser = await interestRepository_1.InterestRepository.forUsers([currentUserId, ...candidates.map((c) => c.user_id)]);
        const myInterestIds = new Set((interestsByUser.get(currentUserId) ?? []).map((i) => i.id));
        return candidates.map((candidate) => {
            const interests = interestsByUser.get(candidate.user_id) ?? [];
            const common = interests.filter((i) => myInterestIds.has(i.id));
            return {
                ...(0, profileMapper_1.toPublicProfile)(candidate.user_id, candidate),
                interactionPreferences: (0, profileMapper_1.parsePreferences)(candidate.interaction_preferences),
                interests,
                // The day they joined (no time), for the "New" sort.
                joinedOn: candidate.created_at ? String(candidate.created_at).slice(0, 10) : null,
                commonInterestsCount: common.length,
                commonInterests: common.map((i) => i.name),
                // Bucketed upper bound, never the computed figure.
                distanceKm: candidate.distance_km === null ? null : (0, distance_service_1.distanceBucketKm)(Number(candidate.distance_km)),
            };
        });
    }
}
exports.DiscoverService = DiscoverService;
