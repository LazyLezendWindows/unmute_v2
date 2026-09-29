"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverQuerySchema = exports.LOOKING_FOR_GROUPS = void 0;
const zod_1 = require("zod");
const common_1 = require("./common");
const locationValidator_1 = require("./locationValidator");
const distance_service_1 = require("../services/location/distance.service");
const profileValidator_1 = require("./profileValidator");
const booleanQuery = zod_1.z.enum(['true', 'false']).transform((v) => v === 'true');
/** "Looking for" groups in the filter, each covering one or more profile answers. */
exports.LOOKING_FOR_GROUPS = {
    Relationship: ['Serious Relationship', 'Long Term'],
    Friendship: ['Friendship'],
    Casual: ['Casual Dating', 'Just Chat'],
};
const ageSchema = zod_1.z.coerce.number().int().min(18, 'Minimum age is 18').max(100, 'Maximum age is 100');
/** Discovery filters. Radius only takes fixed steps so repeated searches cannot pinpoint anyone. */
exports.discoverQuerySchema = (0, common_1.paginationSchema)(20, 50)
    .extend({
    radiusKm: zod_1.z.coerce
        .number()
        .refine((v) => distance_service_1.ALLOWED_RADII_KM.includes(v), {
        message: `Distance must be one of ${distance_service_1.ALLOWED_RADII_KM.join(', ')} km`,
    })
        .optional(),
    placeId: common_1.idSchema.optional(),
    pincode: locationValidator_1.pincodeSchema.optional(),
    institutionId: common_1.idSchema.optional(),
    sameInstitution: booleanQuery.optional(),
    minAge: ageSchema.optional(),
    maxAge: ageSchema.optional(),
    showMe: zod_1.z.enum(['women', 'men']).optional(),
    // Comma-separated, so it survives a plain query string.
    interestIds: zod_1.z
        .string()
        .transform((v) => v.split(',').filter(Boolean))
        .pipe(zod_1.z.array(common_1.idSchema).max(15, 'Choose up to 15 interests'))
        .optional(),
    educationLevel: zod_1.z.enum(profileValidator_1.EDUCATION_LEVELS).optional(),
    professionField: zod_1.z.enum(profileValidator_1.PROFESSION_FIELDS).optional(),
    verifiedOnly: booleanQuery.optional(),
    drinking: zod_1.z.enum(profileValidator_1.HABIT_FREQUENCIES).optional(),
    smoking: zod_1.z.enum(profileValidator_1.HABIT_FREQUENCIES).optional(),
    workout: zod_1.z.enum(profileValidator_1.WORKOUT_FREQUENCIES).optional(),
    // Free-text search, split into up to five words that must all match.
    q: zod_1.z
        .string()
        .max(60, 'Search is too long')
        .transform((v) => v.trim().split(/\s+/).filter(Boolean).slice(0, 5))
        .optional(),
    lookingFor: zod_1.z.enum(Object.keys(exports.LOOKING_FOR_GROUPS)).optional(),
})
    .refine((q) => q.minAge === undefined || q.maxAge === undefined || q.minAge <= q.maxAge, {
    message: 'Minimum age cannot be above maximum age',
    path: ['minAge'],
})
    .refine((q) => !(q.institutionId && q.sameInstitution), {
    message: 'Choose either a specific college or "same as mine", not both',
    path: ['institutionId'],
});
