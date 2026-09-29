"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PincodeRepository = void 0;
const database_1 = require("../config/database");
class PincodeRepository {
    static find(pincode) {
        return (0, database_1.getDatabase)().get(`SELECT pc.pincode, pc.area_name, pc.district_id, pc.state_id, pc.latitude, pc.longitude,
              d.name AS district_name, s.name AS state_name
       FROM pincodes pc
       LEFT JOIN places d ON d.id = pc.district_id
       LEFT JOIN places s ON s.id = pc.state_id
       WHERE pc.pincode = ?`, [pincode]);
    }
    static async upsert(tx, row) {
        await tx.run(`INSERT INTO pincodes (pincode, area_name, district_id, state_id, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE area_name = VALUES(area_name),
         district_id = COALESCE(VALUES(district_id), district_id),
         state_id = COALESCE(VALUES(state_id), state_id),
         latitude = COALESCE(VALUES(latitude), latitude),
         longitude = COALESCE(VALUES(longitude), longitude)`, [row.pincode, row.areaName, row.districtId, row.stateId, row.latitude, row.longitude]);
    }
}
exports.PincodeRepository = PincodeRepository;
