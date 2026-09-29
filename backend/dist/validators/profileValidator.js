"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfileSchema = exports.PROFESSION_FIELDS = exports.EDUCATION_LEVELS = exports.MAX_PHOTOS = exports.LOOKING_FOR = exports.WORKOUT_FREQUENCIES = exports.HABIT_FREQUENCIES = exports.GENDERS = void 0;
const zod_1 = require("zod");
const common_1 = require("./common");
exports.GENDERS = ['woman', 'man', 'nonbinary'];
exports.HABIT_FREQUENCIES = ['never', 'socially', 'regularly'];
exports.WORKOUT_FREQUENCIES = ['never', 'sometimes', 'often'];
/** What members can say they are looking for; Discover's "Looking for" filter matches these. */
exports.LOOKING_FOR = ['Serious Relationship', 'Long Term', 'Friendship', 'Casual Dating', 'Just Chat'];
exports.MAX_PHOTOS = 6;
exports.EDUCATION_LEVELS = ['high_school', 'bachelors', 'masters', 'phd'];
exports.PROFESSION_FIELDS = [
    'it_software', 'healthcare', 'business', 'arts', 'education', 'government', 'finance', 'other',
];
// Photos uploaded to Unmute (checked for ownership by the service), or https images: rejects
// javascript:, data: and plain-http URLs that would be rendered to other users.
const httpsImageUrl = zod_1.z
    .string()
    .max(500)
    .refine((url) => /^\/api\/v1\/media\/[0-9a-f-]+\.(jpg|png|webp)$/.test(url) || (url.startsWith('https://') && zod_1.z.string().url().safeParse(url).success), 'Image URLs must use https');
exports.updateProfileSchema = zod_1.z.object({
    displayName: zod_1.z
        .string()
        .trim()
        .min(2, 'Display name must be at least 2 characters')
        .max(50, 'Display name cannot exceed 50 characters')
        .optional(),
    bio: zod_1.z
        .string()
        .max(500, 'Bio cannot exceed 500 characters')
        .optional(),
    avatarUrl: httpsImageUrl.or(zod_1.z.string().length(0)).optional(),
    interactionPreferences: zod_1.z
        .array(zod_1.z.string().max(50))
        .max(10, 'Cannot select more than 10 interaction preferences')
        .optional(),
    interestIds: zod_1.z
        .array(common_1.idSchema)
        .max(15, 'Cannot select more than 15 interests')
        .optional(),
    gender: zod_1.z.enum(exports.GENDERS).nullable().optional(),
    profession: zod_1.z.string().trim().max(80, 'Profession cannot exceed 80 characters').optional(),
    heightCm: zod_1.z.number().int().min(120, 'Height must be at least 120 cm').max(220, 'Height cannot exceed 220 cm').nullable().optional(),
    lifestyle: zod_1.z
        .object({
        drinking: zod_1.z.enum(exports.HABIT_FREQUENCIES).nullable().optional(),
        smoking: zod_1.z.enum(exports.HABIT_FREQUENCIES).nullable().optional(),
        workout: zod_1.z.enum(exports.WORKOUT_FREQUENCIES).nullable().optional(),
    })
        .optional(),
    educationLevel: zod_1.z.enum(exports.EDUCATION_LEVELS).nullable().optional(),
    professionField: zod_1.z.enum(exports.PROFESSION_FIELDS).nullable().optional(),
    photos: zod_1.z.array(httpsImageUrl).max(exports.MAX_PHOTOS, `Add up to ${exports.MAX_PHOTOS} photos`).optional(),
});
