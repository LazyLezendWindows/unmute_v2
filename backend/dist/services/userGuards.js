"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertActiveUser = assertActiveUser;
exports.assertUserExists = assertUserExists;
exports.assertInteractable = assertInteractable;
const errorHandler_1 = require("../middleware/errorHandler");
const userRepository_1 = require("../repositories/userRepository");
const safetyRepository_1 = require("../repositories/safetyRepository");
/** 404s unless `userId` is an active account. */
async function assertActiveUser(userId) {
    if (!(await userRepository_1.UserRepository.isActive(userId))) {
        throw new errorHandler_1.AppError('User not found', 404);
    }
}
/** 404s unless `userId` exists (any status: deactivated accounts can still be blocked or reported). */
async function assertUserExists(userId) {
    if (!(await userRepository_1.UserRepository.findById(userId))) {
        throw new errorHandler_1.AppError('User not found', 404);
    }
}
/** Target must be an active user with no block in either direction. */
async function assertInteractable(actorId, targetId) {
    await assertActiveUser(targetId);
    if (await safetyRepository_1.SafetyRepository.isBlockedBetween(actorId, targetId)) {
        throw new errorHandler_1.AppError('Action not allowed', 403);
    }
}
