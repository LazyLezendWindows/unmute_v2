"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidDateOfBirth = isValidDateOfBirth;
exports.calculateAge = calculateAge;
exports.isAtLeast18YearsOld = isAtLeast18YearsOld;
/**
 * Calculates age in full years from a date of birth string (YYYY-MM-DD).
 */
function isValidDateOfBirth(dobString) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dobString))
        return false;
    const date = new Date(`${dobString}T00:00:00.000Z`);
    // Date normalizes impossible dates (for example February 31) into the next month.
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dobString;
}
function calculateAge(dobString) {
    if (!isValidDateOfBirth(dobString)) {
        return -1;
    }
    const birthDate = new Date(`${dobString}T00:00:00.000Z`);
    const today = new Date();
    // Match discovery's UTC age boundaries regardless of the server's local timezone.
    let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
    const m = today.getUTCMonth() - birthDate.getUTCMonth();
    if (m < 0 || (m === 0 && today.getUTCDate() < birthDate.getUTCDate())) {
        age--;
    }
    return age;
}
function isAtLeast18YearsOld(dobString, minAge = 18) {
    const age = calculateAge(dobString);
    return age >= minAge;
}
