/**
 * Calculates age in full years from a date of birth string (YYYY-MM-DD).
 */
export function isValidDateOfBirth(dobString: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dobString)) return false;
  const date = new Date(`${dobString}T00:00:00.000Z`);
  // Date normalizes impossible dates (for example February 31) into the next month.
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dobString;
}

export function calculateAge(dobString: string): number {
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

export function isAtLeast18YearsOld(dobString: string, minAge = 18): boolean {
  const age = calculateAge(dobString);
  return age >= minAge;
}
