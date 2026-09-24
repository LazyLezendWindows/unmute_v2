import { z } from 'zod';
import { idSchema } from './common';

export const GENDERS = ['woman', 'man', 'nonbinary'] as const;
export const HABIT_FREQUENCIES = ['never', 'socially', 'regularly'] as const;
export const WORKOUT_FREQUENCIES = ['never', 'sometimes', 'often'] as const;
/** What members can say they are looking for; Discover's "Looking for" filter matches these. */
export const LOOKING_FOR = ['Serious Relationship', 'Long Term', 'Friendship', 'Casual Dating', 'Just Chat'] as const;
export const MAX_PHOTOS = 6;
export const EDUCATION_LEVELS = ['high_school', 'bachelors', 'masters', 'phd'] as const;
export const PROFESSION_FIELDS = [
  'it_software', 'healthcare', 'business', 'arts', 'education', 'government', 'finance', 'other',
] as const;

// Photos uploaded to Unmute (checked for ownership by the service), or https images: rejects
// javascript:, data: and plain-http URLs that would be rendered to other users.
const httpsImageUrl = z
  .string()
  .max(500)
  .refine(
    (url) => /^\/api\/v1\/media\/[0-9a-f-]+\.(jpg|png|webp)$/.test(url) || (url.startsWith('https://') && z.string().url().safeParse(url).success),
    'Image URLs must use https'
  );

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, 'Display name must be at least 2 characters')
    .max(50, 'Display name cannot exceed 50 characters')
    .optional(),
  bio: z
    .string()
    .max(500, 'Bio cannot exceed 500 characters')
    .optional(),
  avatarUrl: httpsImageUrl.or(z.string().length(0)).optional(),
  interactionPreferences: z
    .array(z.string().max(50))
    .max(10, 'Cannot select more than 10 interaction preferences')
    .optional(),
  interestIds: z
    .array(idSchema)
    .max(15, 'Cannot select more than 15 interests')
    .optional(),
  gender: z.enum(GENDERS).nullable().optional(),
  profession: z.string().trim().max(80, 'Profession cannot exceed 80 characters').optional(),
  heightCm: z.number().int().min(120, 'Height must be at least 120 cm').max(220, 'Height cannot exceed 220 cm').nullable().optional(),
  lifestyle: z
    .object({
      drinking: z.enum(HABIT_FREQUENCIES).nullable().optional(),
      smoking: z.enum(HABIT_FREQUENCIES).nullable().optional(),
      workout: z.enum(WORKOUT_FREQUENCIES).nullable().optional(),
    })
    .optional(),
  educationLevel: z.enum(EDUCATION_LEVELS).nullable().optional(),
  professionField: z.enum(PROFESSION_FIELDS).nullable().optional(),
  photos: z.array(httpsImageUrl).max(MAX_PHOTOS, `Add up to ${MAX_PHOTOS} photos`).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
