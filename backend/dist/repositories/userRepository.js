"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../config/database");
class UserRepository {
    static findById(id) {
        return (0, database_1.getDatabase)().get('SELECT id, email, is_active FROM users WHERE id = ?', [id]);
    }
    static findByEmail(email) {
        return (0, database_1.getDatabase)().get('SELECT id, email, is_active FROM users WHERE email = ?', [email]);
    }
    static async isActive(id) {
        return Boolean(await (0, database_1.getDatabase)().get('SELECT id FROM users WHERE id = ? AND is_active = 1', [id]));
    }
    static async insert(tx, email) {
        const id = crypto_1.default.randomUUID();
        await tx.run('INSERT INTO users (id, email, is_active, created_at) VALUES (?, ?, 1, ?)', [
            id,
            email,
            new Date().toISOString(),
        ]);
        return id;
    }
}
exports.UserRepository = UserRepository;
