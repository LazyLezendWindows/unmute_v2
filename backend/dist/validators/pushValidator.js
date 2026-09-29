"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushEndpointSchema = exports.pushSubscriptionSchema = void 0;
const zod_1 = require("zod");
/** Push endpoints are https URLs issued by the browser's push service. */
const endpoint = zod_1.z.string().url().max(700).refine((u) => u.startsWith('https://'), { message: 'Invalid push endpoint' });
exports.pushSubscriptionSchema = zod_1.z.object({
    endpoint,
    keys: zod_1.z.object({ p256dh: zod_1.z.string().min(1).max(255), auth: zod_1.z.string().min(1).max(255) }),
});
exports.pushEndpointSchema = zod_1.z.object({ endpoint });
