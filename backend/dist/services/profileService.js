"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileService = void 0;
const database_1 = require("../config/database");
const errorHandler_1 = require("../middleware/errorHandler");
const profileMapper_1 = require("../mappers/profileMapper");
const profileRepository_1 = require("../repositories/profileRepository");
const interestRepository_1 = require("../repositories/interestRepository");
const interactionRepository_1 = require("../repositories/interactionRepository");
const mediaService_1 = require("./mediaService");
class ProfileService {
    /** The signed-in user's own profile (includes date of birth). */
    static async getProfile(userId) {
        const [profile, interests, likesReceived] = await Promise.all([
            profileRepository_1.ProfileRepository.findByUserId(userId),
            interestRepository_1.InterestRepository.forUser(userId),
            interactionRepository_1.InteractionRepository.countLikesReceived(userId),
        ]);
        if (!profile) {
            throw new errorHandler_1.AppError('Profile not found', 404);
        }
        return { ...(0, profileMapper_1.toOwnProfile)(profile, interests), likesReceived };
    }
    static async updateProfile(userId, input) {
        if (!(await profileRepository_1.ProfileRepository.findByUserId(userId))) {
            throw new errorHandler_1.AppError('Profile not found', 404);
        }
        const images = [input.avatarUrl, ...(input.photos ?? [])].filter((url) => Boolean(url));
        if (images.some((url) => url.startsWith(mediaService_1.MEDIA_PATH) && !mediaService_1.MediaService.isOwnUpload(url, userId))) {
            throw new errorHandler_1.AppError('Use photos you uploaded yourself.', 403);
        }
        const interestIds = input.interestIds !== undefined ? [...new Set(input.interestIds)] : undefined;
        if (interestIds && (await interestRepository_1.InterestRepository.countExisting(interestIds)) !== interestIds.length) {
            throw new errorHandler_1.AppError('One or more selected interests are no longer available', 400);
        }
        // Profile fields and the interest set change together or not at all.
        await (0, database_1.getDatabase)().transaction(async (tx) => {
            await profileRepository_1.ProfileRepository.update(tx, userId, {
                display_name: input.displayName,
                bio: input.bio,
                avatar_url: input.avatarUrl,
                interaction_preferences: input.interactionPreferences !== undefined ? JSON.stringify(input.interactionPreferences) : undefined,
                gender: input.gender,
                profession: input.profession,
                height_cm: input.heightCm,
                drinking: input.lifestyle?.drinking,
                smoking: input.lifestyle?.smoking,
                workout: input.lifestyle?.workout,
                photos: input.photos !== undefined ? JSON.stringify(input.photos) : undefined,
                education_level: input.educationLevel,
                profession_field: input.professionField,
            });
            if (interestIds !== undefined) {
                await interestRepository_1.InterestRepository.replaceForUser(tx, userId, interestIds);
            }
        });
        return this.getProfile(userId);
    }
    static getAllInterests() {
        return interestRepository_1.InterestRepository.listAll();
    }
}
exports.ProfileService = ProfileService;
