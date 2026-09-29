"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeocodingService = void 0;
exports.toPlace = toPlace;
const errorHandler_1 = require("../../middleware/errorHandler");
const locationMapper_1 = require("../../mappers/locationMapper");
const placeRepository_1 = require("../../repositories/placeRepository");
const pincodeRepository_1 = require("../../repositories/pincodeRepository");
/** Places as returned to clients: names and hierarchy only, never coordinates. */
function toPlace(row) {
    const names = { kind: row.kind, name: row.name, districtName: row.district_name, stateName: row.state_name };
    return {
        id: row.id,
        kind: row.kind,
        name: row.name,
        districtName: row.district_name,
        stateName: row.state_name,
        displayName: (0, locationMapper_1.placeDisplayName)(names),
    };
}
/** How far to look for a named place around a device position, smallest settlements first. */
const REVERSE_GEOCODE_STEPS = [
    { kinds: ['city', 'town', 'village'], maxKm: 25 },
    { kinds: ['district'], maxKm: 120 },
];
class GeocodingService {
    static async states() {
        return (await placeRepository_1.PlaceRepository.states()).map(toPlace);
    }
    static async children(parentId, term, limit, offset) {
        if (!(await placeRepository_1.PlaceRepository.findById(parentId))) {
            throw new errorHandler_1.AppError('Place not found', 404);
        }
        return (await placeRepository_1.PlaceRepository.children(parentId, term, limit, offset)).map(toPlace);
    }
    static async search(term, options) {
        return (await placeRepository_1.PlaceRepository.search(term, options)).map(toPlace);
    }
    static async requirePlace(placeId) {
        const place = await placeRepository_1.PlaceRepository.findById(placeId);
        if (!place) {
            throw new errorHandler_1.AppError('That place is no longer available. Please choose another.', 404);
        }
        return place;
    }
    static async lookupPincode(pincode) {
        const row = await pincodeRepository_1.PincodeRepository.find(pincode);
        if (!row) {
            throw new errorHandler_1.AppError("We don't recognise that PIN code yet. Try searching for your town or city instead.", 404);
        }
        return row;
    }
    /** Public PIN code details: the area it covers, without coordinates. */
    static async describePincode(pincode) {
        const row = await this.lookupPincode(pincode);
        return {
            pincode: row.pincode,
            areaName: row.area_name,
            districtId: row.district_id,
            districtName: row.district_name,
            stateName: row.state_name,
        };
    }
    /** The nearest known settlement (or, failing that, district) to a device position. */
    static async placeNear(point) {
        for (const step of REVERSE_GEOCODE_STEPS) {
            const place = await placeRepository_1.PlaceRepository.nearest(point, step.kinds, step.maxKm);
            if (place)
                return place;
        }
        throw new errorHandler_1.AppError("We couldn't match your position to a nearby town yet. Please search for your area instead.", 422);
    }
}
exports.GeocodingService = GeocodingService;
