"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDatabase = getDatabase;
exports.initDatabase = initDatabase;
const promise_1 = __importDefault(require("mysql2/promise"));
const env_1 = require("./env");
const connection_1 = require("./connection");
const migrate_1 = require("./migrate");
// Supports both `?` and `$1`-style placeholders; `$n` is rewritten to positional `?`.
function prepareParams(sql, params) {
    if (!/\$\d+/.test(sql)) {
        return { normalizedSql: sql, boundParams: params };
    }
    const boundParams = [];
    const normalizedSql = sql.replace(/\$(\d+)/g, (_, idx) => {
        boundParams.push(params[parseInt(idx, 10) - 1]);
        return '?';
    });
    return { normalizedSql, boundParams };
}
class MariaDatabase {
    executor;
    constructor(executor) {
        this.executor = executor;
    }
    async query(sql, params = []) {
        const { normalizedSql, boundParams } = prepareParams(sql, params);
        const [rows] = await this.executor.query(normalizedSql, boundParams);
        return rows;
    }
    async get(sql, params = []) {
        const rows = await this.query(sql, params);
        return rows.length > 0 ? rows[0] : null;
    }
    async run(sql, params = []) {
        const { normalizedSql, boundParams } = prepareParams(sql, params);
        const [result] = await this.executor.execute(normalizedSql, boundParams);
        return { changes: result.affectedRows || 0 };
    }
    async exec(sql) {
        await this.executor.query(sql);
    }
    async transaction(fn) {
        if (!('getConnection' in this.executor)) {
            // Already inside a transaction: reuse it.
            return fn(this);
        }
        const conn = await this.executor.getConnection();
        try {
            await conn.beginTransaction();
            const result = await fn(new MariaDatabase(conn));
            await conn.commit();
            return result;
        }
        catch (err) {
            await conn.rollback();
            throw err;
        }
        finally {
            conn.release();
        }
    }
    async close() {
        if ('getConnection' in this.executor) {
            await this.executor.end();
        }
    }
}
let dbInstance = null;
function getDatabase() {
    if (!dbInstance) {
        const pool = promise_1.default.createPool({
            ...(0, connection_1.mariaConnectionOptions)(),
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
        });
        dbInstance = new MariaDatabase(pool);
    }
    return dbInstance;
}
async function initDatabase() {
    console.log(`[DB] Connecting to MariaDB (${env_1.config.mariadb.database})...`);
    await (0, migrate_1.runMigrations)();
    await getDatabase().get('SELECT 1 AS ok');
}
