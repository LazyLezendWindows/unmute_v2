"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailAvailable = emailAvailable;
exports.revealEmailCodes = revealEmailCodes;
exports.sendEmail = sendEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const env_1 = require("../../config/env");
const errorHandler_1 = require("../../middleware/errorHandler");
/**
 * Sends account emails (verification and password-reset codes). `EMAIL_PROVIDER` picks the transport:
 * - `console` (the default outside production): prints the email to the server log.
 * - `smtp`: any SMTP service (Gmail, Zoho, Amazon SES, Brevo…) via SMTP_HOST, SMTP_PORT, SMTP_USER,
 *   SMTP_PASS and EMAIL_FROM.
 */
let transport = null;
function emailAvailable() {
    const { provider, smtp } = env_1.config.email;
    if (provider === 'console')
        return !env_1.config.isProduction;
    if (provider === 'smtp')
        return Boolean(smtp.host && smtp.from);
    return false;
}
/** Local development without a mail service: the code is shown in the app instead. */
function revealEmailCodes() {
    return env_1.config.env === 'development' && env_1.config.email.provider === 'console';
}
async function sendEmail(to, subject, text) {
    if (!emailAvailable())
        throw new errorHandler_1.AppError('Email isn’t available right now. Please try again later.', 503);
    if (env_1.config.email.provider === 'console') {
        console.info(`[Email] to ${to}: ${subject} — ${text}`);
        return;
    }
    const { smtp } = env_1.config.email;
    transport ??= nodemailer_1.default.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    });
    try {
        await transport.sendMail({ from: smtp.from, to, subject, text });
    }
    catch (err) {
        console.error('[Email] Delivery failed:', err?.message);
        throw new errorHandler_1.AppError("We couldn't send the email. Check the address and try again.", 502);
    }
}
