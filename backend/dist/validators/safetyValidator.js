"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportUserSchema = exports.blockUserSchema = void 0;
const zod_1 = require("zod");
const constants_1 = require("../config/constants");
const common_1 = require("./common");
exports.blockUserSchema = zod_1.z.object({
    targetUserId: common_1.idSchema,
    reason: zod_1.z.string().max(200).optional(),
});
exports.reportUserSchema = zod_1.z.object({
    reportedUserId: common_1.idSchema,
    category: zod_1.z.enum(constants_1.REPORT_CATEGORIES, {
        errorMap: () => ({ message: 'Please select a valid report category' }),
    }),
    details: zod_1.z.string().max(1000, 'Details cannot exceed 1000 characters').optional(),
});
