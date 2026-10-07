import { z } from 'zod';
import { idSchema } from './common';

export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message cannot exceed 2000 characters'),
  /** Photo and voice messages carry the URL of the sender's own upload as their content. */
  kind: z.enum(['text', 'image', 'voice', 'gif']).optional(),
  /** Quote an earlier message in this conversation. */
  replyToId: idSchema.optional(),
});

export const reactionSchema = z.object({ emoji: z.string().max(16).nullable() }).strict();
export const messageParamsSchema = z.object({ id: idSchema, messageId: idSchema });

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
