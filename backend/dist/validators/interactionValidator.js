"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.likeSchema = exports.interactionSchema = void 0;
const zod_1 = require("zod");
const common_1 = require("./common");
exports.interactionSchema = zod_1.z.object({
    targetUserId: common_1.idSchema,
});
exports.likeSchema = exports.interactionSchema.extend({ superLike: zod_1.z.boolean().optional() });
