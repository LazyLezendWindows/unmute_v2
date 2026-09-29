"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeHeader = normalizeHeader;
exports.readCsv = readCsv;
exports.pick = pick;
exports.toInt = toInt;
exports.toFloat = toFloat;
exports.normalizeName = normalizeName;
exports.displayName = displayName;
exports.newReport = newReport;
exports.warn = warn;
const fs_1 = __importDefault(require("fs"));
const csv_parse_1 = require("csv-parse");
/** "State Name (In English)" → "statenameinenglish": header spellings vary between dataset releases. */
function normalizeHeader(header) {
    return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}
/** Streams a CSV file as records keyed by normalised header. Handles a UTF-8 BOM and quoted fields. */
function readCsv(filePath) {
    return fs_1.default.createReadStream(filePath).pipe((0, csv_parse_1.parse)({
        bom: true,
        columns: (headers) => headers.map(normalizeHeader),
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
    }));
}
/** First non-empty value among the given (normalised) column aliases. */
function pick(record, aliases) {
    for (const alias of aliases) {
        const value = record[alias];
        if (value !== undefined && value !== '' && value.toUpperCase() !== 'NA')
            return value;
    }
    return '';
}
function toInt(value) {
    if (!/^\d+$/.test(value))
        return null;
    const n = Number(value);
    return n > 0 && n <= 4_294_967_295 ? n : null;
}
function toFloat(value) {
    if (!value)
        return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
/** "ANDHRA PRADESH" / "the Dadra & Nagar Haveli…" → "andhra pradesh" / "dadra and nagar haveli…". */
function normalizeName(name) {
    return name
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/^the\s+/, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}
/** Title-cases ALL-CAPS dataset values for display ("NEW DELHI" → "New Delhi"); leaves mixed case alone. */
function displayName(name) {
    const trimmed = name.replace(/\s+/g, ' ').trim();
    if (trimmed !== trimmed.toUpperCase())
        return trimmed;
    return trimmed.toLowerCase().replace(/(^|[\s(\-/.])([a-z])/g, (_, sep, c) => sep + c.toUpperCase());
}
function newReport() {
    return { rows: 0, imported: 0, skipped: 0, warnings: [] };
}
/** Keeps the first few warnings with a count of the rest, so a bad file cannot flood the console. */
function warn(report, message) {
    report.skipped++;
    if (report.warnings.length < 20)
        report.warnings.push(message);
}
