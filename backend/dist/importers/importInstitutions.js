"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importInstitutions = importInstitutions;
const database_1 = require("../config/database");
const institutionRepository_1 = require("../repositories/institutionRepository");
const csv_1 = require("./csv");
/**
 * Imports the AISHE directory of higher-education institutions (https://aishe.gov.in → Directory):
 * the university, college and standalone-institution lists, one file at a time.
 *   aishe_code, name, state, district, city, kind, short_name
 * `kind` may be omitted: it is read from an institution-type column if present, else from the
 * AISHE code prefix (U- university, C- college, S- standalone), else from `defaultKind`.
 * Rows upsert on AISHE code, so re-importing a newer release updates names in place.
 */
const COLUMNS = {
    aisheCode: ['aishecode', 'aishe', 'aisheid'],
    name: ['name', 'institutionname', 'collegename', 'universityname', 'nameoftheinstitution'],
    shortName: ['shortname', 'abbreviation'],
    state: ['state', 'statename'],
    district: ['district', 'districtname'],
    city: ['city', 'town', 'cityname'],
    kind: ['kind', 'institutiontype', 'institutioncategory'],
};
function kindFrom(typeValue, aisheCode, fallback) {
    if (/univ/i.test(typeValue))
        return 'university';
    if (/college/i.test(typeValue))
        return 'college';
    if (/stand/i.test(typeValue))
        return 'standalone';
    const prefix = aisheCode.charAt(0).toUpperCase();
    if (prefix === 'U')
        return 'university';
    if (prefix === 'C')
        return 'college';
    if (prefix === 'S')
        return 'standalone';
    return fallback ?? null;
}
async function placeLookups(tx) {
    const rows = await tx.query(`SELECT id, kind, name, parent_id FROM places WHERE kind IN ('state', 'district')`);
    const states = new Map();
    const districts = new Map();
    for (const r of rows) {
        if (r.kind === 'state')
            states.set((0, csv_1.normalizeName)(r.name), r.id);
        else if (r.parent_id)
            districts.set(`${r.parent_id}:${(0, csv_1.normalizeName)(r.name)}`, r.id);
    }
    return { states, districts };
}
async function importInstitutions(filePath, options = {}) {
    const report = (0, csv_1.newReport)();
    const db = (0, database_1.getDatabase)();
    const { states, districts } = await placeLookups(db);
    let batch = [];
    const flush = async () => {
        const rows = batch;
        batch = [];
        await db.transaction(async (tx) => {
            for (const row of rows)
                await institutionRepository_1.InstitutionRepository.ensure(tx, row);
        });
    };
    for await (const record of (0, csv_1.readCsv)(filePath)) {
        report.rows++;
        const rowNumber = report.rows + 1;
        const name = (0, csv_1.displayName)((0, csv_1.pick)(record, COLUMNS.name)).slice(0, 255);
        if (!name) {
            (0, csv_1.warn)(report, `row ${rowNumber}: no institution name`);
            continue;
        }
        const aisheCode = (0, csv_1.pick)(record, COLUMNS.aisheCode).toUpperCase().slice(0, 20);
        const kind = kindFrom((0, csv_1.pick)(record, COLUMNS.kind), aisheCode, options.defaultKind);
        if (!kind) {
            (0, csv_1.warn)(report, `row ${rowNumber}: cannot tell whether "${name}" is a university, college or standalone institution`);
            continue;
        }
        const stateId = states.get((0, csv_1.normalizeName)((0, csv_1.pick)(record, COLUMNS.state))) ?? null;
        const districtId = stateId ? districts.get(`${stateId}:${(0, csv_1.normalizeName)((0, csv_1.pick)(record, COLUMNS.district))}`) ?? null : null;
        batch.push({
            aisheCode: aisheCode || null,
            name,
            shortName: (0, csv_1.pick)(record, COLUMNS.shortName).slice(0, 60),
            kind,
            stateId,
            districtId,
            city: (0, csv_1.displayName)((0, csv_1.pick)(record, COLUMNS.city)).slice(0, 150),
        });
        report.imported++;
        if (batch.length >= 1000)
            await flush();
    }
    if (batch.length)
        await flush();
    return report;
}
