"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserEducationRepository = void 0;
const database_1 = require("../config/database");
class UserEducationRepository {
    static find(userId) {
        return (0, database_1.getDatabase)().get('SELECT user_id, institution_id, course, start_year, end_year FROM user_education WHERE user_id = ?', [userId]);
    }
    static async upsert(userId, education) {
        await (0, database_1.getDatabase)().run(`INSERT INTO user_education (user_id, institution_id, course, start_year, end_year)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE institution_id = VALUES(institution_id), course = VALUES(course),
         start_year = VALUES(start_year), end_year = VALUES(end_year)`, [userId, education.institutionId, education.course, education.startYear, education.endYear]);
    }
    static async remove(userId) {
        await (0, database_1.getDatabase)().run('DELETE FROM user_education WHERE user_id = ?', [userId]);
    }
}
exports.UserEducationRepository = UserEducationRepository;
