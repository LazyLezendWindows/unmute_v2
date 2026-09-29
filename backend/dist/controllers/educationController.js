"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EducationController = void 0;
const educationService_1 = require("../services/educationService");
const profileService_1 = require("../services/profileService");
class EducationController {
    static async searchInstitutions(req, res, next) {
        try {
            res.status(200).json({ success: true, data: await educationService_1.EducationService.searchInstitutions(req.query) });
        }
        catch (err) {
            next(err);
        }
    }
    static async getInstitution(req, res, next) {
        try {
            res.status(200).json({ success: true, data: await educationService_1.EducationService.getInstitution(req.params.id) });
        }
        catch (err) {
            next(err);
        }
    }
    static async setMyEducation(req, res, next) {
        try {
            await educationService_1.EducationService.setEducation(req.user.userId, req.body);
            res.status(200).json({ success: true, data: await profileService_1.ProfileService.getProfile(req.user.userId) });
        }
        catch (err) {
            next(err);
        }
    }
    static async clearMyEducation(req, res, next) {
        try {
            await educationService_1.EducationService.clearEducation(req.user.userId);
            res.status(200).json({ success: true, data: await profileService_1.ProfileService.getProfile(req.user.userId) });
        }
        catch (err) {
            next(err);
        }
    }
}
exports.EducationController = EducationController;
