"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.errorHandler = errorHandler;
const env_1 = require("../config/env");
class AppError extends Error {
    statusCode;
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
        Object.setPrototypeOf(this, AppError.prototype);
    }
}
exports.AppError = AppError;
// Errors raised by express.json() carry a `type` and an HTTP `status`.
const BODY_PARSER_ERRORS = {
    'entity.parse.failed': [400, 'Malformed JSON request body'],
    'entity.too.large': [413, 'Request body is too large'],
};
function errorHandler(err, req, res, _next) {
    if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, error: err.message });
        return;
    }
    // An oversized photo upload gets a message the person can act on.
    if (err.type === 'entity.too.large' && req.path.endsWith('/me/photos')) {
        res.status(413).json({ success: false, error: 'Photos must be 5 MB or smaller.' });
        return;
    }
    const parserError = BODY_PARSER_ERRORS[err.type];
    if (parserError) {
        res.status(parserError[0]).json({ success: false, error: parserError[1] });
        return;
    }
    // Unexpected: log details server-side; clients never see SQL, paths or stack traces in production.
    console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        ...(env_1.config.isProduction ? {} : { debug: err.message }),
    });
}
