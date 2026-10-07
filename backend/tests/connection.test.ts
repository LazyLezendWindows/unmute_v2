import { afterEach, describe, expect, it, vi } from 'vitest';
import { mariaConnectionOptions } from '../src/config/connection';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('MariaDB connection configuration', () => {
  it.each(['DATABASE_URL', 'MARIADB_URL'])('keeps the isolated database override when %s is configured', (key) => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('MARIADB_URL', '');
    vi.stubEnv(key, 'mysql://test-user:test-password@db.example:3306/app_data');
    vi.stubEnv('MARIADB_DATABASE', 'isolated_test_db');
    expect(mariaConnectionOptions()).toMatchObject({ host: 'db.example', database: 'isolated_test_db' });
    expect(mariaConnectionOptions({ withDatabase: false })).not.toHaveProperty('database');
  });

  it('uses the URL database when no explicit override is configured', () => {
    vi.stubEnv('DATABASE_URL', 'mysql://test-user:test-password@db.example:3306/url_database');
    vi.stubEnv('MARIADB_DATABASE', '');
    expect(mariaConnectionOptions().database).toBe('url_database');
  });

  it('does not expose credentials from an invalid connection URL in logs', () => {
    vi.stubEnv('DATABASE_URL', 'mysql://test-user:private-password@invalid host/database');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mariaConnectionOptions();
    expect(warning).toHaveBeenCalledOnce();
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private-password');
  });
});
