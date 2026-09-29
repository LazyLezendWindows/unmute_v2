import { z } from 'zod';

/** Push endpoints are https URLs issued by the browser's push service. */
const endpoint = z.string().url().max(700).refine((u) => u.startsWith('https://'), { message: 'Invalid push endpoint' });

export const pushSubscriptionSchema = z.object({
  endpoint,
  keys: z.object({ p256dh: z.string().min(1).max(255), auth: z.string().min(1).max(255) }),
});

export const pushEndpointSchema = z.object({ endpoint });
