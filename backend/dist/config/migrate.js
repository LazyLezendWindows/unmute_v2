"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const promise_1 = __importDefault(require("mysql2/promise"));
const connection_1 = require("./connection");
// Resolves to backend/migrations from both src/config (tsx) and dist/config (compiled).
const MIGRATIONS_DIR = path_1.default.resolve(__dirname, '../../migrations');
const LOCK_NAME = 'unmute_schema_migrations';
/**
 * Applies pending `NNN_name.sql` files from backend/migrations in filename order and records
 * each in `schema_migrations`. MariaDB DDL auto-commits, so every migration must be safe to
 * re-run if it fails midway.
 */
async function runMigrations(options = {}) {
    // A dedicated connection: multi-statement execution is enabled here only, never on the app pool.
    const conn = await promise_1.default.createConnection({
        ...(0, connection_1.mariaConnectionOptions)(),
        ...(options.database ? { database: options.database } : {}),
        multipleStatements: true,
    });
    try {
        const [lockRows] = await conn.query('SELECT GET_LOCK(?, 30) AS acquired', [LOCK_NAME]);
        if (lockRows[0]?.acquired !== 1) {
            throw new Error('Could not acquire the schema migration lock');
        }
        await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
         version VARCHAR(255) PRIMARY KEY,
         applied_at DATETIME NOT NULL
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        const [appliedRows] = await conn.query('SELECT version FROM schema_migrations');
        const applied = new Set(appliedRows.map((r) => r.version));
        const pending = fs_1.default
            .readdirSync(MIGRATIONS_DIR)
            .filter((f) => /^\d+_.+\.sql$/.test(f))
            .sort()
            .filter((f) => !applied.has(f));
        for (const file of pending) {
            const sql = fs_1.default.readFileSync(path_1.default.join(MIGRATIONS_DIR, file), 'utf-8');
            console.log(`[DB] Applying migration ${file}`);
            await conn.query(sql);
            await conn.query('INSERT INTO schema_migrations (version, applied_at) VALUES (?, UTC_TIMESTAMP())', [file]);
        }
    }
    finally {
        await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => undefined);
        await conn.end();
    }
}
// `npm run migrate`: apply migrations without starting the server (e.g. as a deploy step).
if (require.main === module) {
    runMigrations()
        .then(() => {
        console.log('[DB] Migrations are up to date');
        process.exit(0);
    })
        .catch((err) => {
        console.error('[DB] Migration failed:', err);
        process.exit(1);
    });
}
