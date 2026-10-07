import { z } from 'zod';
import { idSchema, paginationSchema } from './common';
import { pincodeSchema } from './locationValidator';
import { ALLOWED_RADII_KM } from '../services/location/distance.service';
import { DIETS, EDUCATION_LEVELS, HABIT_FREQUENCIES, LANGUAGES, MARITAL_STATUSES, PROFESSION_FIELDS, RELIGIONS, WORKOUT_FREQUENCIES } from './profileValidator';

const booleanQuery = z.enum(['true', 'false']).transform((v) => v === 'true');
/** "Looking for" groups in the filter, each covering one or more profile answers. */
export const LOOKING_FOR_GROUPS = {
  Relationship: ['Serious Relationship', 'Long Term'],
  Friendship: ['Friendship'],
  Casual: ['Casual Dating', 'Just Chat'],
} as const;

const ageSchema = z.coerce.number().int().min(18, 'Minimum age is 18').max(100, 'Maximum age is 100');

/** Discovery filters. Radius only takes fixed steps so repeated searches cannot pinpoint anyone. */
export const discoverQuerySchema = paginationSchema(20, 50)
  .extend({
    radiusKm: z.coerce
      .number()
      .refine((v) => (ALLOWED_RADII_KM as readonly number[]).includes(v), {
        message: `Distance must be one of ${ALLOWED_RADII_KM.join(', ')} km`,
      })
      .optional(),
    placeId: idSchema.optional(),
    pincode: pincodeSchema.optional(),
    institutionId: idSchema.optional(),
    sameInstitution: booleanQuery.optional(),
    minAge: ageSchema.optional(),
    maxAge: ageSchema.optional(),
    showMe: z.enum(['women', 'men']).optional(),
    // Comma-separated, so it survives a plain query string.
    interestIds: z
      .string()
      .transform((v) => v.split(',').filter(Boolean))
      .pipe(z.array(idSchema).max(15, 'Choose up to 15 interests'))
      .optional(),
    educationLevel: z.enum(EDUCATION_LEVELS).optional(),
    professionField: z.enum(PROFESSION_FIELDS).optional(),
    verifiedOnly: booleanQuery.optional(),
    drinking: z.enum(HABIT_FREQUENCIES).optional(),
    smoking: z.enum(HABIT_FREQUENCIES).optional(),
    workout: z.enum(WORKOUT_FREQUENCIES).optional(),
    religion: z.enum(RELIGIONS).optional(),
    language: z.enum(LANGUAGES).optional(),
    diet: z.enum(DIETS).optional(),
    maritalStatus: z.enum(MARITAL_STATUSES).optional(),
    // Free-text search, split into up to five words that must all match.
    q: z
      .string()
      .max(60, 'Search is too long')
      .transform((v) => v.trim().split(/\s+/).filter(Boolean).slice(0, 5))
      .optional(),
    lookingFor: z.enum(Object.keys(LOOKING_FOR_GROUPS) as [keyof typeof LOOKING_FOR_GROUPS]).optional(),
  })
  .refine((q) => q.minAge === undefined || q.maxAge === undefined || q.minAge <= q.maxAge, {
    message: 'Minimum age cannot be above maximum age',
    path: ['minAge'],
  })
  .refine((q) => !(q.institutionId && q.sameInstitution), {
    message: 'Choose either a specific college or "same as mine", not both',
    path: ['institutionId'],
  });

export type DiscoverQuery = z.infer<typeof discoverQuerySchema>;
