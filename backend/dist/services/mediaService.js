"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaService = exports.MAX_PHOTO_BYTES = exports.MEDIA_PATH = void 0;
const crypto_1 = __importDefault(require("crypto"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
const errorHandler_1 = require("../middleware/errorHandler");
/** Public path uploaded photos are served under. */
exports.MEDIA_PATH = '/api/v1/media/';
exports.MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** A stored photo's name: `<owner id>-<random id>.<ext>`, so ownership can be checked from the URL alone. */
const MEDIA_FILE = /^([0-9a-f-]{36})-[0-9a-f-]{36}\.(jpg|png|webp)$/;
/** Identifies the image by its first bytes; the declared Content-Type is not trusted. */
function imageExtension(bytes) {
    if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
        return 'jpg';
    if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
        return 'png';
    if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
        return 'webp';
    return null;
}
class MediaService {
    /** Stores an uploaded photo for `userId` and returns the URL to put on their profile. */
    static async savePhoto(userId, body) {
        if (!Buffer.isBuffer(body) || body.length === 0) {
            throw new errorHandler_1.AppError('Choose a JPG, PNG or WebP photo to upload.', 400);
        }
        const ext = imageExtension(body);
        if (!ext)
            throw new errorHandler_1.AppError('Photos must be JPG, PNG or WebP images.', 415);
        const name = `${userId}-${crypto_1.default.randomUUID()}.${ext}`;
        await promises_1.default.mkdir(env_1.config.uploadDir, { recursive: true });
        await promises_1.default.writeFile(path_1.default.join(env_1.config.uploadDir, name), body, { flag: 'wx' });
        return exports.MEDIA_PATH + name;
    }
    /** True for a URL of a photo this member uploaded (another member's upload is not theirs to use). */
    static isOwnUpload(url, userId) {
        if (!url.startsWith(exports.MEDIA_PATH))
            return false;
        const match = MEDIA_FILE.exec(url.slice(exports.MEDIA_PATH.length));
        return Boolean(match && match[1] === userId);
    }
}
exports.MediaService = MediaService;
