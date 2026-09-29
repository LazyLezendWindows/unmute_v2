"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EducationService = void 0;
exports.toInstitution = toInstitution;
const errorHandler_1 = require("../middleware/errorHandler");
const institutionRepository_1 = require("../repositories/institutionRepository");
const userEducationRepository_1 = require("../repositories/userEducationRepository");
function toInstitution(row) {
    return {
        id: row.id,
        name: row.name,
        shortName: row.short_name,
        kind: row.kind,
        city: row.city,
        districtName: row.district_name,
        stateName: row.state_name,
        aisheCode: row.aishe_code,
    };
}
class EducationService {
    static async searchInstitutions(options) {
        const rows = await institutionRepository_1.InstitutionRepository.search({ ...options, term: options.q });
        return rows.map(toInstitution);
    }
    static async getInstitution(id) {
        const row = await institutionRepository_1.InstitutionRepository.findById(id);
        if (!row) {
            throw new errorHandler_1.AppError('Institution not found', 404);
        }
        return toInstitution(row);
    }
    static async setEducation(userId, input) {
        if (!(await institutionRepository_1.InstitutionRepository.findById(input.institutionId))) {
            throw new errorHandler_1.AppError('That institution is no longer available. Please choose another.', 404);
        }
        await userEducationRepository_1.UserEducationRepository.upsert(userId, input);
    }
    static clearEducation(userId) {
        return userEducationRepository_1.UserEducationRepository.remove(userId);
    }
    /** The member's institution id, if they have added one. */
    static async institutionIdFor(userId) {
        return (await userEducationRepository_1.UserEducationRepository.find(userId))?.institution_id ?? null;
    }
}
exports.EducationService = EducationService;
