"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserLocationRepository = void 0;
const database_1 = require("../config/database");
class UserLocationRepository {
    static find(userId) {
        return (0, database_1.getDatabase)().get(`SELECT user_id, place_id, pincode, latitude, longitude, source, label_precision
       FROM user_locations WHERE user_id = ?`, [userId]);
    }
    /** Stored (coarsened) coordinates for several members; members without any are left out. */
    static async coordinatesFor(userIds) {
        if (userIds.length === 0)
            return new Map();
        const rows = await (0, database_1.getDatabase)().query(`SELECT user_id, latitude, longitude FROM user_locations
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND user_id IN (${userIds.map(() => '?').join(', ')})`, userIds);
        return new Map(rows.map((r) => [r.user_id, { latitude: Number(r.latitude), longitude: Number(r.longitude) }]));
    }
    /** `coordinates` must already be coarsened; this layer stores whatever it is given. */
    static async upsert(tx, userId, location) {
        await tx.run(`INSERT INTO user_locations (user_id, place_id, pincode, latitude, longitude, source, label_precision)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE place_id = VALUES(place_id), pincode = VALUES(pincode),
         latitude = VALUES(latitude), longitude = VALUES(longitude),
         source = VALUES(source), label_precision = VALUES(label_precision)`, [
            userId,
            location.placeId,
            location.pincode,
            location.coordinates?.latitude ?? null,
            location.coordinates?.longitude ?? null,
            location.source,
            location.precision,
        ]);
    }
    static async setPrecision(userId, precision) {
        const { changes } = await (0, database_1.getDatabase)().run('UPDATE user_locations SET label_precision = ? WHERE user_id = ?', [
            precision,
            userId,
        ]);
        return changes > 0;
    }
    static async remove(userId) {
        await (0, database_1.getDatabase)().run('DELETE FROM user_locations WHERE user_id = ?', [userId]);
    }
}
exports.UserLocationRepository = UserLocationRepository;
