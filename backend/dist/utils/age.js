"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateAge = calculateAge;
exports.isAtLeast18YearsOld = isAtLeast18YearsOld;
/**
 * Calculates age in full years from a date of birth string (YYYY-MM-DD).
 */
function calculateAge(dobString) {
    const birthDate = new Date(dobString);
    if (isNaN(birthDate.getTime())) {
        return -1;
    }
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}
function isAtLeast18YearsOld(dobString, minAge = 18) {
    const age = calculateAge(dobString);
    return age >= minAge;
}
