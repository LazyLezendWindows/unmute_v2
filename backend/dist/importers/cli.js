"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../config/database");
const importPlaces_1 = require("./importPlaces");
const importPincodes_1 = require("./importPincodes");
const importInstitutions_1 = require("./importInstitutions");
const USAGE = `Usage: npm run import:data -- <places|pincodes|institutions> <file.csv> [--kind university|college|standalone]

  places        LGD directory downloads (states, districts, sub-districts, villages, local bodies)
  pincodes      India Post "All India Pincode Directory" (import places first)
  institutions  AISHE university / college / standalone lists (import places first)`;
async function main() {
    const [dataset, file, ...rest] = process.argv.slice(2);
    if (!dataset || !file) {
        console.error(USAGE);
        process.exit(2);
    }
    const kindFlag = rest.indexOf('--kind');
    const defaultKind = kindFlag >= 0 ? rest[kindFlag + 1] : undefined;
    if (defaultKind && !['university', 'college', 'standalone'].includes(defaultKind)) {
        console.error(`Unknown --kind "${defaultKind}"\n\n${USAGE}`);
        process.exit(2);
    }
    await (0, database_1.initDatabase)();
    const started = Date.now();
    let report;
    switch (dataset) {
        case 'places':
            report = await (0, importPlaces_1.importPlaces)(file);
            break;
        case 'pincodes':
            report = await (0, importPincodes_1.importPincodes)(file);
            break;
        case 'institutions':
            report = await (0, importInstitutions_1.importInstitutions)(file, { defaultKind });
            break;
        default:
            console.error(`Unknown dataset "${dataset}"\n\n${USAGE}`);
            process.exit(2);
    }
    console.log(`[Import] ${dataset}: ${report.rows} rows read, ${report.imported} imported, ${report.skipped} skipped ` +
        `in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    for (const w of report.warnings)
        console.warn(`[Import]   ${w}`);
    if (report.skipped > report.warnings.length) {
        console.warn(`[Import]   …and ${report.skipped - report.warnings.length} more skipped rows`);
    }
    await (0, database_1.getDatabase)().close();
}
main().catch((err) => {
    console.error('[Import] Failed:', err);
    process.exit(1);
});
