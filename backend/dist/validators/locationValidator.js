"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pincodeParamsSchema = exports.placeChildrenQuerySchema = exports.placeSearchQuerySchema = exports.updatePrecisionSchema = exports.setLocationSchema = exports.precisionSchema = exports.pincodeSchema = void 0;
const zod_1 = require("zod");
const common_1 = require("./common");
/** Indian PIN codes are six digits and never start with 0. */
exports.pincodeSchema = zod_1.z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code');
exports.precisionSchema = zod_1.z.enum(['locality', 'city', 'state'], {
    errorMap: () => ({ message: 'Choose how much of your area to show: locality, city or state' }),
});
const placeKindSchema = zod_1.z.enum(['state', 'district', 'subdistrict', 'city', 'town', 'village']);
/** How a member sets their area: pick a place, enter a PIN code, or share the device position once. */
exports.setLocationSchema = zod_1.z.discriminatedUnion('mode', [
    zod_1.z.object({ mode: zod_1.z.literal('place'), placeId: common_1.idSchema, precision: exports.precisionSchema.default('city') }).strict(),
    zod_1.z.object({ mode: zod_1.z.literal('pincode'), pincode: exports.pincodeSchema, precision: exports.precisionSchema.default('city') }).strict(),
    zod_1.z
        .object({
        mode: zod_1.z.literal('device'),
        latitude: zod_1.z.number().min(-90).max(90),
        longitude: zod_1.z.number().min(-180).max(180),
        precision: exports.precisionSchema.default('city'),
    })
        .strict(),
], { errorMap: () => ({ message: 'Choose a place, enter a PIN code, or use your current location' }) });
exports.updatePrecisionSchema = zod_1.z.object({ precision: exports.precisionSchema }).strict();
exports.placeSearchQuerySchema = zod_1.z.object({
    q: zod_1.z.string().trim().min(2, 'Type at least 2 letters to search').max(100),
    kinds: zod_1.z
        .string()
        .optional()
        .transform((v, ctx) => {
        if (!v)
            return undefined;
        const parsed = zod_1.z.array(placeKindSchema).max(6).safeParse(v.split(','));
        if (!parsed.success) {
            ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'Unknown place type' });
            return zod_1.z.NEVER;
        }
        return parsed.data;
    }),
    stateId: common_1.idSchema.optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(25).default(10),
});
exports.placeChildrenQuerySchema = zod_1.z.object({
    q: zod_1.z.string().trim().max(100).optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(200).default(100),
    offset: zod_1.z.coerce.number().int().min(0).max(100_000).default(0),
});
exports.pincodeParamsSchema = zod_1.z.object({ pincode: exports.pincodeSchema });
