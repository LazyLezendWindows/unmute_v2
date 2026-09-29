"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importPlaces = importPlaces;
const database_1 = require("../config/database");
const placeRepository_1 = require("../repositories/placeRepository");
const distance_service_1 = require("../services/location/distance.service");
const csv_1 = require("./csv");
/**
 * Imports the Local Government Directory (https://lgdirectory.gov.in → Download Directory).
 *
 * Accepts the LGD state, district, sub-district, village and urban local body downloads directly,
 * or any CSV with these columns (header spelling and case are flexible):
 *   state_code, state_name, district_code, district_name, subdistrict_code, subdistrict_name,
 *   village_code, village_name, town_code, town_name, town_type, latitude, longitude
 * Each row upserts its whole chain (state → district → sub-district → village, or district → town),
 * keyed on LGD codes when present, so files can be imported in any order and re-imported safely.
 */
const COLUMNS = {
    stateCode: ['statecode', 'statelgdcode'],
    stateName: ['statenameinenglish', 'statename', 'statenameenglish'],
    districtCode: ['districtcode', 'districtlgdcode'],
    districtName: ['districtnameinenglish', 'districtname', 'districtnameenglish'],
    subdistrictCode: ['subdistrictcode', 'subdistrictlgdcode', 'tehsilcode'],
    subdistrictName: ['subdistrictnameinenglish', 'subdistrictname', 'subdistrictnameenglish', 'tehsilname'],
    villageCode: ['villagecode', 'villagelgdcode'],
    villageName: ['villagenameinenglish', 'villagename', 'villagenameenglish'],
    townCode: ['towncode', 'localbodycode', 'localbodylgdcode'],
    townName: ['townname', 'localbodynameinenglish', 'localbodyname', 'localbodynameenglish'],
    townType: ['towntype', 'localbodytype', 'localbodytypename'],
    latitude: ['latitude', 'lat'],
    longitude: ['longitude', 'long', 'lng', 'lon'],
};
const BATCH_SIZE = 1000;
/** Municipal corporations are cities; municipalities, nagar panchayats etc. are towns. */
function townKind(type) {
    return /corporation|mahanagar/i.test(type) ? 'city' : 'town';
}
async function importPlaces(filePath) {
    const report = (0, csv_1.newReport)();
    const db = (0, database_1.getDatabase)();
    const cache = new Map();
    let leaves = [];
    let pending = [];
    const ensureCached = async (tx, key, input) => {
        let id = cache.get(key);
        if (!id) {
            id = await placeRepository_1.PlaceRepository.ensure(tx, input);
            cache.set(key, id);
        }
        return id;
    };
    const flush = async () => {
        const batch = pending;
        pending = [];
        await db.transaction(async (tx) => {
            for (const item of batch)
                await item.ensure(tx);
            await placeRepository_1.PlaceRepository.upsertCodedBatch(tx, leaves);
        });
        leaves = [];
    };
    for await (const record of (0, csv_1.readCsv)(filePath)) {
        report.rows++;
        const rowNumber = report.rows + 1; // +1 for the header line
        const v = (aliases) => (0, csv_1.pick)(record, aliases);
        const stateCode = (0, csv_1.toInt)(v(COLUMNS.stateCode));
        const stateName = (0, csv_1.displayName)(v(COLUMNS.stateName));
        if (!stateCode && !stateName) {
            (0, csv_1.warn)(report, `row ${rowNumber}: no state code or name`);
            continue;
        }
        const lat = (0, csv_1.toFloat)(v(COLUMNS.latitude));
        const lng = (0, csv_1.toFloat)(v(COLUMNS.longitude));
        const coords = lat !== null && lng !== null && (0, distance_service_1.isWithinIndia)({ latitude: lat, longitude: lng }) ? { lat, lng } : null;
        pending.push({
            row: rowNumber,
            ensure: async (tx) => {
                const stateId = await ensureCached(tx, `state:${stateCode ?? stateName.toLowerCase()}`, {
                    kind: 'state',
                    name: stateName || `State ${stateCode}`,
                    parentId: null,
                    stateId: null,
                    districtId: null,
                    lgdCode: stateCode,
                });
                const districtCode = (0, csv_1.toInt)(v(COLUMNS.districtCode));
                const districtName = (0, csv_1.displayName)(v(COLUMNS.districtName));
                if (!districtCode && !districtName) {
                    report.imported++;
                    return;
                }
                const districtId = await ensureCached(tx, `district:${districtCode ?? `${stateId}:${districtName.toLowerCase()}`}`, {
                    kind: 'district',
                    name: districtName || `District ${districtCode}`,
                    parentId: stateId,
                    stateId,
                    districtId: null,
                    lgdCode: districtCode,
                });
                let parentId = districtId;
                const subCode = (0, csv_1.toInt)(v(COLUMNS.subdistrictCode));
                const subName = (0, csv_1.displayName)(v(COLUMNS.subdistrictName));
                if (subCode || subName) {
                    parentId = await ensureCached(tx, `subdistrict:${subCode ?? `${districtId}:${subName.toLowerCase()}`}`, {
                        kind: 'subdistrict',
                        name: subName || `Sub-district ${subCode}`,
                        parentId: districtId,
                        stateId,
                        districtId,
                        lgdCode: subCode,
                    });
                }
                const villageName = (0, csv_1.displayName)(v(COLUMNS.villageName));
                const townName = (0, csv_1.displayName)(v(COLUMNS.townName));
                const leafName = villageName || townName;
                if (!leafName) {
                    report.imported++;
                    return;
                }
                const leaf = {
                    kind: villageName ? 'village' : townKind(v(COLUMNS.townType)),
                    name: leafName,
                    parentId: villageName ? parentId : districtId,
                    stateId,
                    districtId,
                    lgdCode: (0, csv_1.toInt)(villageName ? v(COLUMNS.villageCode) : v(COLUMNS.townCode)),
                    latitude: coords?.lat ?? null,
                    longitude: coords?.lng ?? null,
                };
                if (leaf.lgdCode) {
                    leaves.push(leaf);
                }
                else {
                    await placeRepository_1.PlaceRepository.ensure(tx, leaf);
                }
                report.imported++;
            },
        });
        if (pending.length >= BATCH_SIZE)
            await flush();
    }
    if (pending.length)
        await flush();
    return report;
}
