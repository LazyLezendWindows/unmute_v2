"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InterestRepository = void 0;
const database_1 = require("../config/database");
const sql_1 = require("./sql");
class InterestRepository {
    static listAll() {
        return (0, database_1.getDatabase)().query('SELECT id, name, category, icon FROM interests ORDER BY category, name ASC');
    }
    /** Interests for many users in one query, keyed by user id (users without interests map to []). */
    static async forUsers(userIds) {
        const byUser = new Map(userIds.map((id) => [id, []]));
        if (userIds.length === 0)
            return byUser;
        const rows = await (0, database_1.getDatabase)().query(`SELECT ui.user_id, i.id, i.name, i.category, i.icon
       FROM user_interests ui
       JOIN interests i ON i.id = ui.interest_id
       WHERE ui.user_id IN (${(0, sql_1.placeholders)(userIds.length)})
       ORDER BY i.category, i.name`, userIds);
        for (const { user_id, ...interest } of rows) {
            byUser.get(user_id)?.push(interest);
        }
        return byUser;
    }
    static async forUser(userId) {
        return (await this.forUsers([userId])).get(userId) ?? [];
    }
    static async countExisting(ids) {
        if (ids.length === 0)
            return 0;
        const row = await (0, database_1.getDatabase)().get(`SELECT COUNT(*) AS n FROM interests WHERE id IN (${(0, sql_1.placeholders)(ids.length)})`, ids);
        return Number(row?.n ?? 0);
    }
    static async replaceForUser(tx, userId, interestIds) {
        await tx.run('DELETE FROM user_interests WHERE user_id = ?', [userId]);
        if (interestIds.length === 0)
            return;
        await tx.run(`INSERT INTO user_interests (user_id, interest_id) VALUES ${interestIds.map(() => '(?, ?)').join(', ')}`, interestIds.flatMap((id) => [userId, id]));
    }
}
exports.InterestRepository = InterestRepository;
