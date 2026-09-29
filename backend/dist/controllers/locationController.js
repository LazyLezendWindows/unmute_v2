"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationController = void 0;
const geocoding_service_1 = require("../services/location/geocoding.service");
const geolocation_service_1 = require("../services/location/geolocation.service");
const profileService_1 = require("../services/profileService");
class LocationController {
    static async states(_req, res, next) {
        try {
            res.status(200).json({ success: true, data: await geocoding_service_1.GeocodingService.states() });
        }
        catch (err) {
            next(err);
        }
    }
    static async children(req, res, next) {
        try {
            const { q, limit, offset } = req.query;
            res.status(200).json({ success: true, data: await geocoding_service_1.GeocodingService.children(req.params.id, q, limit, offset) });
        }
        catch (err) {
            next(err);
        }
    }
    static async search(req, res, next) {
        try {
            const { q, kinds, stateId, limit } = req.query;
            res.status(200).json({ success: true, data: await geocoding_service_1.GeocodingService.search(q, { kinds, stateId, limit }) });
        }
        catch (err) {
            next(err);
        }
    }
    static async pincode(req, res, next) {
        try {
            res.status(200).json({ success: true, data: await geocoding_service_1.GeocodingService.describePincode(req.params.pincode) });
        }
        catch (err) {
            next(err);
        }
    }
    /** Responds with the updated own profile so the client can refresh in one round trip. */
    static async setMyLocation(req, res, next) {
        try {
            await geolocation_service_1.UserLocationService.setLocation(req.user.userId, req.body);
            res.status(200).json({ success: true, data: await profileService_1.ProfileService.getProfile(req.user.userId) });
        }
        catch (err) {
            next(err);
        }
    }
    static async updateMyPrecision(req, res, next) {
        try {
            await geolocation_service_1.UserLocationService.setPrecision(req.user.userId, req.body.precision);
            res.status(200).json({ success: true, data: await profileService_1.ProfileService.getProfile(req.user.userId) });
        }
        catch (err) {
            next(err);
        }
    }
    static async clearMyLocation(req, res, next) {
        try {
            await geolocation_service_1.UserLocationService.clearLocation(req.user.userId);
            res.status(200).json({ success: true, data: await profileService_1.ProfileService.getProfile(req.user.userId) });
        }
        catch (err) {
            next(err);
        }
    }
}
exports.LocationController = LocationController;
