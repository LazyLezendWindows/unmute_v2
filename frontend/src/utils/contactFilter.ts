/**
 * Spots phone numbers in chat messages, so members keep talking (and calling) inside Unmute where
 * Block and Report protect them. Ordinary numbers stay allowed ("I'm 25", "at 7:30", "₹1,500",
 * "12/08/1996"); what's refused is a run of 9 or more digits, however it is disguised:
 * separators ("98765 43210", "+91-98765-43210", "9.8.7…"), look-alike digits (emoji keycaps,
 * full-width or Devanagari digits), and spelled-out digits in English or Hindi ("nine eight seven…",
 * "double nine", "ek do teen…"). Copy of backend/src/utils/contactFilter.ts (the server enforces it);
 * here it warns while typing.
 */

/** A phone number has at least this many digits (Indian mobiles have 10; this leaves room for dates). */
export const MIN_PHONE_DIGITS = 9;

const WORD_DIGITS: Record<string, string> = {
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  // Hindi, as people type it in English letters
  shunya: '0', ek: '1', do: '2', teen: '3', char: '4', chaar: '4', panch: '5', paanch: '5', chhe: '6', chhah: '6', che: '6',
  saat: '7', sat: '7', aath: '8', ath: '8', nau: '9', no: '9',
};
const REPEATERS: Record<string, number> = { double: 2, triple: 3 };
const DEVANAGARI_ZERO = 0x0966;

/** Turns look-alike digits into 0-9 and drops emoji keycap marks. */
function normalise(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - DEVANAGARI_ZERO))
    .replace(/[️⃣]/g, '')
    .toLowerCase();
}

/** The longest run of digits in the text, reading digit groups and number words in a row as one run. */
export function longestDigitRun(text: string): string {
  const tokens = normalise(text).split(/[^a-z0-9]+/).filter(Boolean);
  let best = '';
  let run = '';
  let repeat = 1;
  for (const token of tokens) {
    let digits: string | null = null;
    if (/^\d+$/.test(token)) digits = token;
    else if (token in WORD_DIGITS) digits = WORD_DIGITS[token];
    else if (token in REPEATERS) {
      repeat = REPEATERS[token];
      continue;
    } else {
      // Mixed tokens like "98765abc43210" still carry digits; anything else ends the run.
      const inner = token.replace(/[^0-9]/g, '');
      if (inner.length >= 3) digits = inner;
    }
    if (digits === null) {
      if (run.length > best.length) best = run;
      run = '';
      repeat = 1;
      continue;
    }
    run += repeat > 1 ? digits[0].repeat(repeat) + digits.slice(1) : digits;
    repeat = 1;
  }
  return run.length > best.length ? run : best;
}

export function containsPhoneNumber(text: string): boolean {
  return longestDigitRun(text).length >= MIN_PHONE_DIGITS;
}

/** True when a message is just digits or number words (a piece of a number sent in parts). */
export function isNumberFragment(text: string): boolean {
  const run = longestDigitRun(text);
  if (!run) return false;
  const tokens = normalise(text).split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.every((t) => /^\d+$/.test(t) || t in WORD_DIGITS || t in REPEATERS);
}

export const PHONE_NUMBER_MESSAGE =
  'For your safety, phone numbers can’t be shared in chat. Keep talking here, or use a voice or video call in Unmute.';
