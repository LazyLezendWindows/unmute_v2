"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationRepository = void 0;
const database_1 = require("../config/database");
const sql_1 = require("./sql");
class ConversationRepository {
    /** The conversation if `userId` is a participant, with the other participant's id. */
    static findForParticipant(conversationId, userId) {
        return (0, database_1.getDatabase)().get(`SELECT c.id,
              IF(c.user_a_id = $2, c.user_b_id, c.user_a_id) AS other_user_id,
              ${(0, sql_1.blockedBetween)('c.user_a_id', 'c.user_b_id')} AS blocked
       FROM conversations c
       WHERE c.id = $1 AND (c.user_a_id = $2 OR c.user_b_id = $2)`, [conversationId, userId]);
    }
    /** Conversations of `userId`, excluding any with a block between the participants, newest activity first. */
    static listForUser(userId) {
        return (0, database_1.getDatabase)().query(`SELECT c.id, c.match_id, c.last_message_at, c.created_at,
              IF(c.user_a_id = $1, c.user_b_id, c.user_a_id) AS other_user_id
       FROM conversations c
       WHERE (c.user_a_id = $1 OR c.user_b_id = $1)
         AND NOT ${(0, sql_1.blockedBetween)('c.user_a_id', 'c.user_b_id')}
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`, [userId]);
    }
    static async idsBetween(userX, userY) {
        const rows = await (0, database_1.getDatabase)().query(`SELECT id FROM conversations
       WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)`, [userX, userY, userY, userX]);
        return rows.map((r) => r.id);
    }
    static async touch(conversationId, at) {
        await (0, database_1.getDatabase)().run('UPDATE conversations SET last_message_at = ? WHERE id = ?', [at, conversationId]);
    }
}
exports.ConversationRepository = ConversationRepository;
