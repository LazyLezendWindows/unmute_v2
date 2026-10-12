import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { containsPhoneNumber } from '../../src/utils/contactFilter';

/** The app's copy must match the server's rules (backend/src/utils/contactFilter.ts), minus the header comment. */
const body = (file: string) => fs.readFileSync(file, 'utf8').replace(/^\/\*\*[\s\S]*?\*\/\s*/, '');

describe('chat phone-number warning', () => {
  it('uses exactly the same rules as the server', () => {
    expect(body(path.resolve(__dirname, '../../src/utils/contactFilter.ts'))).toBe(
      body(path.resolve(__dirname, '../../../backend/src/utils/contactFilter.ts'))
    );
  });

  it('warns about phone numbers but not normal numbers', () => {
    expect(containsPhoneNumber('call 98765 43210')).toBe(true);
    expect(containsPhoneNumber('nine eight seven six five four three two one')).toBe(true);
    expect(containsPhoneNumber("I'm 25, free at 7:30")).toBe(false);
  });
});
