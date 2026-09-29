"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileController = void 0;
const profileService_1 = require("../services/profileService");
const mediaService_1 = require("../services/mediaService");
class ProfileController {
    static async getMyProfile(req, res, next) {
        try {
            const profile = await profileService_1.ProfileService.getProfile(req.user.userId);
            res.status(200).json({
                success: true,
                data: profile,
            });
        }
        catch (err) {
            next(err);
        }
    }
    static async updateMyProfile(req, res, next) {
        try {
            const updated = await profileService_1.ProfileService.updateProfile(req.user.userId, req.body);
            res.status(200).json({
                success: true,
                data: updated,
            });
        }
        catch (err) {
            next(err);
        }
    }
    /** Stores the raw image body; the profile uses it once the returned URL is saved with PATCH /me. */
    static async uploadPhoto(req, res, next) {
        try {
            const url = await mediaService_1.MediaService.savePhoto(req.user.userId, req.body);
            res.status(201).json({ success: true, data: { url } });
        }
        catch (err) {
            next(err);
        }
    }
    static async uploadVoice(req, res, next) {
        try {
            const url = await mediaService_1.MediaService.saveVoice(req.user.userId, req.body);
            res.status(201).json({ success: true, data: { url } });
        }
        catch (err) {
            next(err);
        }
    }
    static async getInterests(_req, res, next) {
        try {
            const interests = await profileService_1.ProfileService.getAllInterests();
            res.status(200).json({
                success: true,
                data: interests,
            });
        }
        catch (err) {
            next(err);
        }
    }
}
exports.ProfileController = ProfileController;
