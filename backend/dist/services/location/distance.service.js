"use strict";
/**
 * Location privacy primitives. Nothing here touches the database.
 *
 * Exact positions never leave the device's request: coordinates are snapped to a grid cell before
 * they are stored, distances shown to other members are bucketed, and radius filters only accept
 * a fixed set of values. Together this keeps members from trilaterating each other by moving a
 * search point or narrowing a radius step by step.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.INDIA_BOUNDS = exports.ALLOWED_RADII_KM = exports.GRID_DEGREES = void 0;
exports.isWithinIndia = isWithinIndia;
exports.snapToGrid = snapToGrid;
exports.haversineKm = haversineKm;
exports.haversineSql = haversineSql;
exports.haversineParams = haversineParams;
exports.boundingBox = boundingBox;
exports.distanceBucketKm = distanceBucketKm;
const EARTH_RADIUS_KM = 6371;
/** Grid cell size in degrees (~1.1 km north–south; ~1 km east–west across most of India). */
exports.GRID_DEGREES = 0.01;
/** The only radius values discovery accepts. */
exports.ALLOWED_RADII_KM = [5, 10, 25, 50, 100, 200];
/** Generous bounding box for India, including Andaman & Nicobar and Lakshadweep. */
exports.INDIA_BOUNDS = { minLat: 6, maxLat: 37.6, minLng: 68, maxLng: 97.5 };
function isWithinIndia({ latitude, longitude }) {
    return (latitude >= exports.INDIA_BOUNDS.minLat &&
        latitude <= exports.INDIA_BOUNDS.maxLat &&
        longitude >= exports.INDIA_BOUNDS.minLng &&
        longitude <= exports.INDIA_BOUNDS.maxLng);
}
/** The centre of the grid cell containing the point, so the stored value reveals only the cell. */
function snapToGrid({ latitude, longitude }) {
    const snap = (value) => {
        const cell = Math.floor(value / exports.GRID_DEGREES);
        return Number(((cell + 0.5) * exports.GRID_DEGREES).toFixed(5));
    };
    return { latitude: snap(latitude), longitude: snap(longitude) };
}
function haversineKm(a, b) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
/**
 * SQL for the great-circle distance in km from a fixed point to the row's coordinate columns.
 * Binds three parameters, in order: latitude, latitude, longitude.
 */
function haversineSql(latColumn, lngColumn) {
    return `(${2 * EARTH_RADIUS_KM} * ASIN(LEAST(1, SQRT(
    POW(SIN(RADIANS(${latColumn} - ?) / 2), 2) +
    COS(RADIANS(?)) * COS(RADIANS(${latColumn})) * POW(SIN(RADIANS(${lngColumn} - ?) / 2), 2)
  ))))`;
}
function haversineParams({ latitude, longitude }) {
    return [latitude, latitude, longitude];
}
/** A lat/lng box that contains every point within `radiusKm`, for an index-friendly prefilter. */
function boundingBox({ latitude, longitude }, radiusKm) {
    const latDelta = radiusKm / 111.32;
    const lngDelta = radiusKm / (111.32 * Math.max(0.01, Math.cos((latitude * Math.PI) / 180)));
    return {
        minLat: latitude - latDelta,
        maxLat: latitude + latDelta,
        minLng: longitude - lngDelta,
        maxLng: longitude + lngDelta,
    };
}
/**
 * What other members see instead of a distance: an upper bound that never goes below 2 km
 * (below the grid's resolution a precise figure would be false precision anyway).
 */
function distanceBucketKm(km) {
    if (km <= 2)
        return 2;
    if (km <= 5)
        return 5;
    if (km <= 10)
        return 10;
    if (km <= 100)
        return Math.ceil(km / 5) * 5;
    return Math.ceil(km / 50) * 50;
}
