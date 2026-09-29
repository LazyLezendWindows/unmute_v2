"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.idParamsSchema = exports.idSchema = void 0;
exports.paginationSchema = paginationSchema;
const zod_1 = require("zod");
/** Every entity id in Unmute is a server-generated UUID. */
exports.idSchema = zod_1.z.string().uuid('Invalid id');
exports.idParamsSchema = zod_1.z.object({ id: exports.idSchema });
/** Bounded pagination for list endpoints; query strings are coerced to integers. */
function paginationSchema(defaultLimit, maxLimit) {
    return zod_1.z.object({
        limit: zod_1.z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
        offset: zod_1.z.coerce.number().int().min(0).max(10_000).default(0),
    });
}
