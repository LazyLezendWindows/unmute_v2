"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserLocationService = void 0;
const database_1 = require("../../config/database");
const errorHandler_1 = require("../../middleware/errorHandler");
const placeRepository_1 = require("../../repositories/placeRepository");
const profileRepository_1 = require("../../repositories/profileRepository");
const userLocationRepository_1 = require("../../repositories/userLocationRepository");
const distance_service_1 = require("./distance.service");
const geocoding_service_1 = require("./geocoding.service");
/** A member's own area: where discovery measures distance from, and what others see about it. */
class UserLocationService {
    static async setLocation(userId, input) {
        const resolved = await this.resolve(input);
        await (0, database_1.getDatabase)().transaction(async (tx) => {
            await userLocationRepository_1.UserLocationRepository.upsert(tx, userId, { ...resolved, precision: input.precision });
            // The structured area replaces the old free-text location, so the two can never disagree.
            await profileRepository_1.ProfileRepository.update(tx, userId, { approximate_location: '' });
        });
    }
    static async setPrecision(userId, precision) {
        if (!(await userLocationRepository_1.UserLocationRepository.setPrecision(userId, precision))) {
            throw new errorHandler_1.AppError('Set your area first, then choose how much of it to show.', 404);
        }
    }
    static clearLocation(userId) {
        return userLocationRepository_1.UserLocationRepository.remove(userId);
    }
    /** The viewer's stored (coarsened) coordinates, used as the origin for distance filters. */
    static async originFor(userId) {
        return (0, placeRepository_1.toCoordinates)(await userLocationRepository_1.UserLocationRepository.find(userId));
    }
    static async resolve(input) {
        switch (input.mode) {
            case 'place': {
                const place = await geocoding_service_1.GeocodingService.requirePlace(input.placeId);
                if (place.kind === 'state') {
                    throw new errorHandler_1.AppError('Please choose a district, city, town or village rather than a whole state.', 400);
                }
                return {
                    placeId: place.id,
                    pincode: null,
                    coordinates: await placeRepository_1.PlaceRepository.coordinatesFor(place),
                    source: 'place',
                };
            }
            case 'pincode': {
                const pin = await geocoding_service_1.GeocodingService.lookupPincode(input.pincode);
                let coordinates = (0, placeRepository_1.toCoordinates)(pin);
                if (!coordinates && pin.district_id) {
                    const district = await placeRepository_1.PlaceRepository.findById(pin.district_id);
                    coordinates = district ? await placeRepository_1.PlaceRepository.coordinatesFor(district) : null;
                }
                return {
                    placeId: pin.district_id ?? pin.state_id,
                    pincode: pin.pincode,
                    coordinates,
                    source: 'pincode',
                };
            }
            case 'device': {
                const raw = { latitude: input.latitude, longitude: input.longitude };
                if (!(0, distance_service_1.isWithinIndia)(raw)) {
                    throw new errorHandler_1.AppError('Unmute is available in India only. Please search for your area instead.', 422);
                }
                // Only the grid cell is ever used or stored; the exact position is discarded here.
                const coordinates = (0, distance_service_1.snapToGrid)(raw);
                const place = await geocoding_service_1.GeocodingService.placeNear(coordinates);
                return { placeId: place.id, pincode: null, coordinates, source: 'device' };
            }
        }
    }
}
exports.UserLocationService = UserLocationService;
