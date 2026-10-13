import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { mariaConnectionOptions } from '../src/config/connection';
import { runMigrations } from '../src/config/migrate';
import { config } from '../src/config/env';

// A throwaway database shaped like a pre-migration install (credentials on `users`).
const LEGACY_DB = config.mariadb.database.replace(/_test_db$/, '_migration_test_db');
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

let conn: mysql.Connection;

async function columns(table: string): Promise<string[]> {
  const [rows] = await conn.query(
    'SELECT column_name AS name FROM information_schema.columns WHERE table_schema = ? AND table_name = ?',
    [LEGACY_DB, table]
  );
  return (rows as { name: string }[]).map((r) => r.name);
}

describe('Schema migrations', () => {
  beforeAll(async () => {
    const admin = await mysql.createConnection(mariaConnectionOptions({ withDatabase: false }));
    await admin.query(`DROP DATABASE IF EXISTS \`${LEGACY_DB}\``);
    await admin.query(`CREATE DATABASE \`${LEGACY_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.end();

    conn = await mysql.createConnection({ ...mariaConnectionOptions(), database: LEGACY_DB, multipleStatements: true });
    // Legacy install: baseline schema only, with credentials stored on users.
    await conn.query(fs.readFileSync(path.join(MIGRATIONS_DIR, '001_baseline.sql'), 'utf-8'));
    await conn.query(
      `CREATE TABLE schema_migrations (version VARCHAR(255) PRIMARY KEY, applied_at DATETIME NOT NULL);
       INSERT INTO schema_migrations VALUES ('001_baseline.sql', UTC_TIMESTAMP());
       INSERT INTO users (id, email, google_id, password_hash, is_active, created_at) VALUES
         ('u-pass', 'pass@example.com', NULL, '$2a$12$legacyhashlegacyhashlegacyhashlegacyhashlegacyhash12', 1, '2025-01-01T00:00:00.000Z'),
         ('u-goog', 'goog@example.com', 'google-sub-legacy', NULL, 1, '2025-01-01T00:00:00.000Z');
       INSERT INTO auth_accounts (id, user_id, provider, provider_account_id, created_at, updated_at) VALUES
         ('stale', 'u-pass', 'local', 'pass@example.com', 'x', 'x');
       INSERT INTO interests (id, name, category, icon) VALUES ('i-old', 'Coffee Brewing', 'Lifestyle', 'Coffee');
       INSERT INTO user_interests (user_id, interest_id) VALUES ('u-pass', 'i-old');`
    );
  });

  afterAll(async () => {
    await conn.query(`DROP DATABASE IF EXISTS \`${LEGACY_DB}\``);
    await conn.end();
  });

  it('moves legacy credentials into auth_accounts and drops them from users', async () => {
    await runMigrations({ database: LEGACY_DB });

    const [accounts] = await conn.query(
      'SELECT user_id, provider, provider_account_id, password_hash FROM auth_accounts ORDER BY provider'
    );
    expect(accounts).toEqual([
      { user_id: 'u-goog', provider: 'google', provider_account_id: 'google-sub-legacy', password_hash: null },
      {
        user_id: 'u-pass',
        provider: 'password',
        provider_account_id: 'u-pass',
        password_hash: '$2a$12$legacyhashlegacyhashlegacyhashlegacyhashlegacyhash12',
      },
    ]);

    const userColumns = await columns('users');
    expect(userColumns).not.toContain('password_hash');
    expect(userColumns).not.toContain('google_id');
  });

  it('merges the older overlapping interests into the new ones, keeping members\' choices', async () => {
    const [rows] = await conn.query(
      `SELECT i.name FROM user_interests ui JOIN interests i ON i.id = ui.interest_id WHERE ui.user_id = 'u-pass'`
    );
    expect(rows).toEqual([{ name: 'Coffee' }]);
    const [old] = await conn.query("SELECT id FROM interests WHERE name = 'Coffee Brewing'");
    expect(old).toEqual([]);
  });

  it('records every migration once and is a no-op when re-run', async () => {
    await runMigrations({ database: LEGACY_DB });
    const [rows] = await conn.query('SELECT version FROM schema_migrations ORDER BY version');
    const expected = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    expect((rows as { version: string }[]).map((r) => r.version)).toEqual(expected);
  });

  it('indexes message history by conversation and time', async () => {
    const [rows] = await conn.query(
      `SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols FROM information_schema.statistics
       WHERE table_schema = ? AND table_name = 'messages' AND index_name = 'idx_messages_conv'`,
      [LEGACY_DB]
    );
    expect((rows as { cols: string }[])[0].cols).toBe('conversation_id,created_at');
  });

  it('safely applies migration 007 when columns like profession already exist, preserving existing data', async () => {
    const PARTIAL_DB = config.mariadb.database.replace(/_test_db$/, '_partial_migration_test_db');
    const admin = await mysql.createConnection(mariaConnectionOptions({ withDatabase: false }));
    await admin.query(`DROP DATABASE IF EXISTS \`${PARTIAL_DB}\``);
    await admin.query(`CREATE DATABASE \`${PARTIAL_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.end();

    const pConn = await mysql.createConnection({ ...mariaConnectionOptions(), database: PARTIAL_DB, multipleStatements: true });
    try {
      // Setup migrations 001 through 006
      await pConn.query(
        `CREATE TABLE schema_migrations (version VARCHAR(255) PRIMARY KEY, applied_at DATETIME NOT NULL);`
      );

      const earlyMigrations = ['001_baseline.sql', '002_server_sessions.sql', '003_password_credentials_to_auth_accounts.sql', '004_drop_legacy_user_credentials.sql', '005_index_cleanup.sql', '006_places_and_education.sql'];
      for (const m of earlyMigrations) {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, m), 'utf-8');
        await pConn.query(sql);
        await pConn.query('INSERT INTO schema_migrations VALUES (?, UTC_TIMESTAMP())', [m]);
      }

      // Insert a user and profile row
      await pConn.query(
        `INSERT INTO users (id, email, is_active, created_at) VALUES ('p-user', 'partial@example.com', 1, '2025-01-01T00:00:00.000Z');
         INSERT INTO profiles (id, user_id, display_name, date_of_birth, bio, created_at, updated_at) VALUES
           ('p-prof', 'p-user', 'Partial Tester', '1995-05-15', 'Preserve my bio', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');`
      );

      // Simulate the exact production failure state:
      // A previous run added profession and gender, but failed or was interrupted before recording 007_profile_details.sql in schema_migrations
      await pConn.query(`
        ALTER TABLE profiles
          ADD COLUMN profession VARCHAR(80) NOT NULL DEFAULT '',
          ADD COLUMN gender VARCHAR(16) DEFAULT NULL;
        CREATE INDEX idx_profiles_gender ON profiles (gender);
        UPDATE profiles SET profession = 'Lead Architect', gender = 'woman' WHERE id = 'p-prof';
      `);

      // Verify profession is present before running migration 007
      const [colRows] = await pConn.query(
        'SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = "profiles" AND column_name = "profession"',
        [PARTIAL_DB]
      );
      expect((colRows as any[]).length).toBe(1);

      // Now run migrations - migration 007 must NOT fail with ER_DUP_FIELDNAME
      await runMigrations({ database: PARTIAL_DB });

      // Verify all 7 columns from migration 007 exist
      const [allCols] = await pConn.query(
        'SELECT column_name AS name FROM information_schema.columns WHERE table_schema = ? AND table_name = "profiles"',
        [PARTIAL_DB]
      );
      const colNames = (allCols as { name: string }[]).map((c) => c.name);
      expect(colNames).toContain('gender');
      expect(colNames).toContain('profession');
      expect(colNames).toContain('height_cm');
      expect(colNames).toContain('drinking');
      expect(colNames).toContain('smoking');
      expect(colNames).toContain('workout');
      expect(colNames).toContain('photos');

      // Verify existing row data was preserved and not overwritten
      const [profileRows] = await pConn.query<{ profession: string; gender: string; bio: string }[]>(
        'SELECT profession, gender, bio FROM profiles WHERE id = "p-prof"'
      );
      expect(profileRows[0].profession).toBe('Lead Architect');
      expect(profileRows[0].gender).toBe('woman');
      expect(profileRows[0].bio).toBe('Preserve my bio');

      // Verify 007 is recorded in schema_migrations
      const [applied007] = await pConn.query(
        'SELECT version FROM schema_migrations WHERE version = "007_profile_details.sql"'
      );
      expect((applied007 as any[]).length).toBe(1);

      // Verify repeated migration run is completely idempotent
      await expect(runMigrations({ database: PARTIAL_DB })).resolves.not.toThrow();
    } finally {
      await pConn.query(`DROP DATABASE IF EXISTS \`${PARTIAL_DB}\``).catch(() => undefined);
      await pConn.end();
    }
  });
});
