import { z } from 'zod';

export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message cannot exceed 2000 characters'),
  /** Photo and voice messages carry the URL of the sender's own upload as their content. */
  kind: z.enum(['text', 'image', 'voice']).optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
