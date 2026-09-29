"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateParams = exports.validateQuery = exports.validateBody = void 0;
const zod_1 = require("zod");
/** Validates and replaces `req[part]` with the parsed value; invalid input gets a 400 with field issues. */
function validate(part, schema) {
    return async (req, res, next) => {
        try {
            req[part] = await schema.parseAsync(req[part]);
            next();
        }
        catch (err) {
            if (err instanceof zod_1.ZodError) {
                const firstIssue = err.issues[0];
                res.status(400).json({
                    success: false,
                    error: firstIssue?.message || 'Invalid request data',
                    issues: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
                });
                return;
            }
            next(err);
        }
    };
}
const validateBody = (schema) => validate('body', schema);
exports.validateBody = validateBody;
const validateQuery = (schema) => validate('query', schema);
exports.validateQuery = validateQuery;
const validateParams = (schema) => validate('params', schema);
exports.validateParams = validateParams;
