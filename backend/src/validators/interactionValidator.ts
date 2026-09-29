import { z } from 'zod';
import { idSchema } from './common';

export const interactionSchema = z.object({
  targetUserId: idSchema,
});

export const likeSchema = interactionSchema.extend({ superLike: z.boolean().optional() });

export type InteractionInput = z.infer<typeof interactionSchema>;
