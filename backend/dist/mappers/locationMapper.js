"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.locationLabel = locationLabel;
exports.placeDisplayName = placeDisplayName;
exports.toCoordinate = toCoordinate;
/** Joins name parts, dropping blanks and repeats ("Hyderabad, Hyderabad, Telangana" → "Hyderabad, Telangana"). */
function join(...parts) {
    const seen = new Set();
    return parts
        .filter((p) => {
        if (!p)
            return false;
        const key = p.toLowerCase();
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    })
        .join(', ');
}
/**
 * The area name other members see, at the member's chosen precision:
 * - `locality`: the place itself — "Kandi, Sangareddy", "Hyderabad, Telangana"
 * - `city`: villages and sub-districts widen to their district — "Sangareddy, Telangana"
 * - `state`: only the state — "Telangana"
 */
function locationLabel(place, precision) {
    const state = place.kind === 'state' ? place.name : place.stateName;
    if (precision === 'state' || place.kind === 'state')
        return state || place.name;
    const isSettlementOrDistrict = place.kind === 'city' || place.kind === 'town' || place.kind === 'district';
    if (isSettlementOrDistrict)
        return join(place.name, state);
    // Villages and sub-districts
    return precision === 'locality' ? join(place.name, place.districtName || state) : join(place.districtName, state);
}
/** A place as listed in search results and pickers: always fully qualified, for disambiguation. */
function placeDisplayName(place) {
    if (place.kind === 'state')
        return place.name;
    if (place.kind === 'district')
        return join(place.name, place.stateName);
    return join(place.name, place.districtName, place.stateName);
}
/** mysql2 returns DECIMAL columns as strings. */
function toCoordinate(value) {
    if (value === null || value === undefined)
        return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
