"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setEducationSchema = exports.institutionSearchQuerySchema = void 0;
const zod_1 = require("zod");
const common_1 = require("./common");
const currentYear = () => new Date().getFullYear();
exports.institutionSearchQuerySchema = zod_1.z.object({
    q: zod_1.z.string().trim().min(2, 'Type at least 2 letters to search').max(100).optional(),
    stateId: common_1.idSchema.optional(),
    districtId: common_1.idSchema.optional(),
    kind: zod_1.z.enum(['university', 'college', 'standalone']).optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(50).default(15),
    offset: zod_1.z.coerce.number().int().min(0).max(10_000).default(0),
});
const yearSchema = zod_1.z.number().int().min(1950, 'Enter a year after 1950');
exports.setEducationSchema = zod_1.z
    .object({
    institutionId: common_1.idSchema,
    course: zod_1.z.string().trim().max(100, 'Course cannot exceed 100 characters').default(''),
    startYear: yearSchema.nullable().default(null),
    endYear: yearSchema.nullable().default(null),
})
    .strict()
    .refine((e) => e.startYear === null || e.startYear <= currentYear(), {
    message: 'Start year cannot be in the future',
    path: ['startYear'],
})
    .refine((e) => e.endYear === null || e.endYear <= currentYear() + 8, {
    message: 'End year is too far in the future',
    path: ['endYear'],
})
    .refine((e) => e.startYear === null || e.endYear === null || e.endYear >= e.startYear, {
    message: 'End year cannot be before start year',
    path: ['endYear'],
});
