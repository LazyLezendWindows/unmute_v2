"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importPincodes = importPincodes;
const database_1 = require("../config/database");
const pincodeRepository_1 = require("../repositories/pincodeRepository");
const distance_service_1 = require("../services/location/distance.service");
const csv_1 = require("./csv");
/**
 * Imports the India Post "All India Pincode Directory" (data.gov.in), one row per post office:
 *   officename, pincode, officetype, district, statename, latitude, longitude
 * Offices are aggregated per PIN code: coordinates are averaged over offices with plausible
 * values, and the area name is taken from the head or sub office where there is one.
 * States and districts are matched by name against places already imported from LGD; PIN codes
 * whose district cannot be matched are still imported, attached to their state only.
 */
const COLUMNS = {
    pincode: ['pincode', 'pin', 'postalcode'],
    office: ['officename', 'office', 'areaname', 'area'],
    officeType: ['officetype'],
    district: ['district', 'districtname'],
    state: ['statename', 'state'],
    latitude: ['latitude', 'lat'],
    longitude: ['longitude', 'long', 'lng', 'lon'],
};
/** Head offices name an area best, then sub offices, then branch offices. */
function officeRank(type) {
    const t = type.toUpperCase().replace(/[^A-Z]/g, '');
    return t === 'HO' ? 0 : t === 'SO' ? 1 : 2;
}
function cleanOfficeName(name) {
    return (0, csv_1.displayName)(name.replace(/\s+(H\.?O|S\.?O|B\.?O|G\.?P\.?O)\.?$/i, ''));
}
async function placeLookups(tx) {
    const rows = await tx.query(`SELECT id, kind, name, parent_id FROM places WHERE kind IN ('state', 'district')`);
    const states = new Map();
    const districts = new Map();
    for (const r of rows) {
        if (r.kind === 'state')
            states.set((0, csv_1.normalizeName)(r.name), r.id);
    }
    for (const r of rows) {
        if (r.kind === 'district' && r.parent_id)
            districts.set(`${r.parent_id}:${(0, csv_1.normalizeName)(r.name)}`, r.id);
    }
    return { states, districts };
}
async function importPincodes(filePath) {
    const report = (0, csv_1.newReport)();
    const byPin = new Map();
    for await (const record of (0, csv_1.readCsv)(filePath)) {
        report.rows++;
        const pincode = (0, csv_1.pick)(record, COLUMNS.pincode).replace(/\s/g, '');
        if (!/^[1-9]\d{5}$/.test(pincode)) {
            (0, csv_1.warn)(report, `row ${report.rows + 1}: invalid PIN code "${pincode}"`);
            continue;
        }
        const agg = byPin.get(pincode) ??
            { area: '', areaRank: 9, district: '', state: '', latSum: 0, lngSum: 0, points: 0 };
        const rank = officeRank((0, csv_1.pick)(record, COLUMNS.officeType));
        const office = (0, csv_1.pick)(record, COLUMNS.office);
        if (office && rank < agg.areaRank) {
            agg.area = cleanOfficeName(office);
            agg.areaRank = rank;
        }
        agg.district ||= (0, csv_1.pick)(record, COLUMNS.district);
        agg.state ||= (0, csv_1.pick)(record, COLUMNS.state);
        const lat = (0, csv_1.toFloat)((0, csv_1.pick)(record, COLUMNS.latitude));
        const lng = (0, csv_1.toFloat)((0, csv_1.pick)(record, COLUMNS.longitude));
        if (lat !== null && lng !== null && (0, distance_service_1.isWithinIndia)({ latitude: lat, longitude: lng })) {
            agg.latSum += lat;
            agg.lngSum += lng;
            agg.points++;
        }
        byPin.set(pincode, agg);
    }
    const db = (0, database_1.getDatabase)();
    const { states, districts } = await placeLookups(db);
    const unmatchedStates = new Set();
    const entries = [...byPin.entries()];
    for (let i = 0; i < entries.length; i += 1000) {
        await db.transaction(async (tx) => {
            for (const [pincode, agg] of entries.slice(i, i + 1000)) {
                const stateId = states.get((0, csv_1.normalizeName)(agg.state)) ?? null;
                if (!stateId && agg.state)
                    unmatchedStates.add(agg.state);
                const districtId = stateId ? districts.get(`${stateId}:${(0, csv_1.normalizeName)(agg.district)}`) ?? null : null;
                await pincodeRepository_1.PincodeRepository.upsert(tx, {
                    pincode,
                    areaName: agg.area,
                    districtId,
                    stateId,
                    latitude: agg.points ? Number((agg.latSum / agg.points).toFixed(5)) : null,
                    longitude: agg.points ? Number((agg.lngSum / agg.points).toFixed(5)) : null,
                });
                report.imported++;
            }
        });
    }
    for (const state of unmatchedStates) {
        report.warnings.push(`state "${state}" did not match any imported state; its PIN codes have no state`);
    }
    return report;
}
