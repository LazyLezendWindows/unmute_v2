"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaceRepository = void 0;
exports.likePrefix = likePrefix;
exports.toCoordinates = toCoordinates;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../config/database");
const distance_service_1 = require("../services/location/distance.service");
const PLACE_COLUMNS = `pl.id, pl.kind, pl.name, pl.parent_id, pl.state_id, pl.district_id, pl.lgd_code,
    pl.latitude, pl.longitude, d.name AS district_name, s.name AS state_name`;
const PLACE_FROM = `places pl
  LEFT JOIN places d ON d.id = pl.district_id
  LEFT JOIN places s ON s.id = pl.state_id`;
const PLACE_SELECT = `SELECT ${PLACE_COLUMNS} FROM ${PLACE_FROM}`;
/** Search ranking: settlements people actually say they live in come first. */
const KIND_RANK = `FIELD(pl.kind, 'city', 'town', 'district', 'village', 'subdistrict', 'state')`;
/** Escapes LIKE wildcards so user input only ever matches literally. */
function likePrefix(term) {
    return `${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
class PlaceRepository {
    static findById(id) {
        return (0, database_1.getDatabase)().get(`${PLACE_SELECT} WHERE pl.id = ?`, [id]);
    }
    static states() {
        return (0, database_1.getDatabase)().query(`${PLACE_SELECT} WHERE pl.kind = 'state' ORDER BY pl.name`);
    }
    static children(parentId, term, limit, offset) {
        const params = [parentId];
        let filter = '';
        if (term) {
            filter = 'AND pl.name LIKE ?';
            params.push(likePrefix(term));
        }
        return (0, database_1.getDatabase)().query(`${PLACE_SELECT} WHERE pl.parent_id = ? ${filter} ORDER BY ${KIND_RANK}, pl.name LIMIT ? OFFSET ?`, [...params, limit, offset]);
    }
    /** Name-prefix search across the hierarchy, optionally narrowed to kinds and/or a state. */
    static search(term, options) {
        const conditions = ['pl.name LIKE ?'];
        const params = [likePrefix(term)];
        if (options.kinds?.length) {
            conditions.push(`pl.kind IN (${options.kinds.map(() => '?').join(', ')})`);
            params.push(...options.kinds);
        }
        if (options.stateId) {
            conditions.push('(pl.state_id = ? OR pl.id = ?)');
            params.push(options.stateId, options.stateId);
        }
        return (0, database_1.getDatabase)().query(`${PLACE_SELECT} WHERE ${conditions.join(' AND ')}
       ORDER BY ${KIND_RANK}, CHAR_LENGTH(pl.name), pl.name
       LIMIT ?`, [...params, options.limit]);
    }
    /** The nearest place of the given kinds within `maxKm`, for turning a device position into an area. */
    static async nearest(point, kinds, maxKm) {
        const box = (0, distance_service_1.boundingBox)(point, maxKm);
        const distance = (0, distance_service_1.haversineSql)('pl.latitude', 'pl.longitude');
        return (0, database_1.getDatabase)().get(`SELECT * FROM (
         SELECT ${PLACE_COLUMNS}, ${distance} AS distance_km FROM ${PLACE_FROM}
         WHERE pl.kind IN (${kinds.map(() => '?').join(', ')})
           AND pl.latitude BETWEEN ? AND ? AND pl.longitude BETWEEN ? AND ?
       ) candidates
       WHERE distance_km <= ?
       ORDER BY distance_km
       LIMIT 1`, [...(0, distance_service_1.haversineParams)(point), ...kinds, box.minLat, box.maxLat, box.minLng, box.maxLng, maxKm]);
    }
    /**
     * Approximate coordinates for a place: its own, else its parent's, else its district's.
     * Villages imported from LGD usually have none of their own.
     */
    static async coordinatesFor(place) {
        const own = toCoordinates(place);
        if (own)
            return own;
        const ancestorIds = [place.parent_id, place.district_id].filter((id) => Boolean(id));
        if (ancestorIds.length === 0)
            return null;
        const rows = await (0, database_1.getDatabase)().query(`SELECT id, latitude, longitude FROM places WHERE id IN (${ancestorIds.map(() => '?').join(', ')})`, ancestorIds);
        for (const id of ancestorIds) {
            const coords = toCoordinates(rows.find((r) => r.id === id));
            if (coords)
                return coords;
        }
        return null;
    }
    /**
     * Finds a place by LGD code, else by (parent, kind, name), else creates it; fills in a missing
     * LGD code or coordinates on an existing row. Used by the sample seed and the dataset importers.
     */
    static async ensure(tx, input) {
        const lat = input.latitude ?? null;
        const lng = input.longitude ?? null;
        if (input.lgdCode) {
            const byCode = await tx.get('SELECT id FROM places WHERE kind = ? AND lgd_code = ?', [
                input.kind,
                input.lgdCode,
            ]);
            if (byCode) {
                await tx.run(`UPDATE places SET name = ?, parent_id = ?, state_id = ?, district_id = ?,
             latitude = COALESCE(?, latitude), longitude = COALESCE(?, longitude)
           WHERE id = ?`, [input.name, input.parentId, input.stateId, input.districtId, lat, lng, byCode.id]);
                return byCode.id;
            }
        }
        const byName = await tx.get(`SELECT id FROM places WHERE parent_id <=> ? AND kind = ? AND name = ?
         AND (lgd_code IS NULL OR ? IS NULL)
       LIMIT 1`, [input.parentId, input.kind, input.name, input.lgdCode ?? null]);
        if (byName) {
            await tx.run(`UPDATE places SET lgd_code = COALESCE(lgd_code, ?),
           latitude = COALESCE(latitude, ?), longitude = COALESCE(longitude, ?)
         WHERE id = ?`, [input.lgdCode ?? null, lat, lng, byName.id]);
            return byName.id;
        }
        const id = crypto_1.default.randomUUID();
        await tx.run(`INSERT INTO places (id, kind, name, parent_id, state_id, district_id, lgd_code, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, input.kind, input.name, input.parentId, input.stateId, input.districtId, input.lgdCode ?? null, lat, lng]);
        return id;
    }
    /**
     * Bulk upsert of leaf places that all carry LGD codes (e.g. villages), keyed on (kind, lgd_code).
     * One statement per batch keeps a full LGD import (~650k villages) practical.
     */
    static async upsertCodedBatch(tx, rows) {
        if (rows.length === 0)
            return;
        const values = rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const params = rows.flatMap((r) => [
            crypto_1.default.randomUUID(),
            r.kind,
            r.name,
            r.parentId,
            r.stateId,
            r.districtId,
            r.lgdCode,
            r.latitude,
            r.longitude,
        ]);
        await tx.run(`INSERT INTO places (id, kind, name, parent_id, state_id, district_id, lgd_code, latitude, longitude)
       VALUES ${values}
       ON DUPLICATE KEY UPDATE name = VALUES(name), parent_id = VALUES(parent_id), state_id = VALUES(state_id),
         district_id = VALUES(district_id),
         latitude = COALESCE(VALUES(latitude), latitude), longitude = COALESCE(VALUES(longitude), longitude)`, params);
    }
    /** Resolves a district by name within a state (case-insensitive), for PIN and AISHE imports. */
    static findDistrictByName(tx, stateId, name) {
        return tx.get(`SELECT id FROM places WHERE kind = 'district' AND parent_id = ? AND name = ? LIMIT 1`, [
            stateId,
            name,
        ]);
    }
    static findStateByName(tx, name) {
        return tx.get(`SELECT id FROM places WHERE kind = 'state' AND name = ? LIMIT 1`, [name]);
    }
}
exports.PlaceRepository = PlaceRepository;
function toCoordinates(row) {
    if (!row || row.latitude === null || row.longitude === null)
        return null;
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}
