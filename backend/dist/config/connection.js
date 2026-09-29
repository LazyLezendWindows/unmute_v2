"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mariaConnectionOptions = mariaConnectionOptions;
const fs_1 = __importDefault(require("fs"));
const env_1 = require("./env");
/** Connection options shared by the app pool, the migrator and test setup. */
function mariaConnectionOptions({ withDatabase = true } = {}) {
    const dbUrl = process.env.DATABASE_URL || process.env.MARIADB_URL;
    if (dbUrl) {
        try {
            const parsed = new URL(dbUrl);
            const opts = {
                host: parsed.hostname,
                port: parseInt(parsed.port || '3306', 10),
                user: decodeURIComponent(parsed.username || ''),
                password: decodeURIComponent(parsed.password || ''),
                ...(withDatabase && parsed.pathname && parsed.pathname !== '/'
                    ? { database: parsed.pathname.replace(/^\//, '') }
                    : {}),
            };
            if (parsed.searchParams.get('ssl') === 'true' ||
                parsed.searchParams.get('ssl-mode') ||
                process.env.MARIADB_SSL === 'true' ||
                env_1.config.isProduction) {
                opts.ssl = { rejectUnauthorized: false };
            }
            return opts;
        }
        catch (e) {
            console.warn('[DB] Failed to parse DATABASE_URL, falling back to individual variables:', e);
        }
    }
    const opts = {
        user: env_1.config.mariadb.user,
        password: env_1.config.mariadb.password,
        ...(withDatabase ? { database: env_1.config.mariadb.database } : {}),
    };
    if (fs_1.default.existsSync(env_1.config.mariadb.socketPath)) {
        opts.socketPath = env_1.config.mariadb.socketPath;
    }
    else {
        opts.host = env_1.config.mariadb.host;
        opts.port = env_1.config.mariadb.port;
        if (process.env.MARIADB_SSL === 'true') {
            opts.ssl = { rejectUnauthorized: false };
        }
    }
    return opts;
}
