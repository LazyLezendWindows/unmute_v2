import { describe, it, expect } from 'vitest';
import { isOnline, markConnected, markDisconnected } from '../src/sockets/presence';

describe('Presence', () => {
  it('stays online until the last open socket closes', () => {
    markConnected('two-tabs');
    markConnected('two-tabs');
    markDisconnected('two-tabs');
    expect(isOnline('two-tabs')).toBe(true);
    markDisconnected('two-tabs');
    expect(isOnline('two-tabs')).toBe(false);
  });

  it('treats a stray disconnect as offline', () => {
    markDisconnected('never-connected');
    expect(isOnline('never-connected')).toBe(false);
  });
});
