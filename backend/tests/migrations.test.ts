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

  it('safely applies migration 011 across incompatible collations, duplicate relationships, and repeated runs', async () => {
    // Test on a database created with a collation different from table collation (utf8mb4_general_ci vs utf8mb4_unicode_ci)
    // to simulate the MySQL 8 utf8mb4_0900_ai_ci production collation conflict.
    const COLLATION_DB = config.mariadb.database.replace(/_test_db$/, '_collation_test_db');
    const admin = await mysql.createConnection(mariaConnectionOptions({ withDatabase: false }));
    await admin.query(`DROP DATABASE IF EXISTS \`${COLLATION_DB}\``);
    await admin.query(`CREATE DATABASE \`${COLLATION_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    await admin.end();

    const cConn = await mysql.createConnection({
      ...mariaConnectionOptions(),
      database: COLLATION_DB,
      multipleStatements: true,
    });

    try {
      // Run migrations 001 through 010 first
      await cConn.query(
        `CREATE TABLE schema_migrations (version VARCHAR(255) PRIMARY KEY, applied_at DATETIME NOT NULL);`
      );
      const earlyMigrations = [
        '001_baseline.sql',
        '002_server_sessions.sql',
        '003_password_credentials_to_auth_accounts.sql',
        '004_drop_legacy_user_credentials.sql',
        '005_index_cleanup.sql',
        '006_places_and_education.sql',
        '007_profile_details.sql',
        '008_education_level_profession_field.sql',
        '009_notifications.sql',
        '010_phone_sign_in.sql',
      ];
      for (const m of earlyMigrations) {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, m), 'utf-8');
        await cConn.query(sql);
        await cConn.query('INSERT INTO schema_migrations VALUES (?, UTC_TIMESTAMP())', [m]);
      }

      // Populate test users and interests:
      // u1: has old interest 'Reading & Books' (should merge into 'Reading')
      // u2: already has BOTH old 'Writing & Poetry' AND target 'Reading' (should deduplicate without error)
      // u3: has old interest 'Design & UI/UX' (should merge into 'Art')
      await cConn.query(`
        INSERT INTO users (id, email, is_active, created_at) VALUES
          ('u1', 'u1@example.com', 1, '2025-01-01T00:00:00.000Z'),
          ('u2', 'u2@example.com', 1, '2025-01-01T00:00:00.000Z'),
          ('u3', 'u3@example.com', 1, '2025-01-01T00:00:00.000Z');

        INSERT INTO interests (id, name, category, icon) VALUES
          ('i-rb', 'Reading & Books', 'Culture', 'BookOpen'),
          ('i-wp', 'Writing & Poetry', 'Culture', 'BookOpen'),
          ('i-r-new', 'Reading', 'Culture', 'BookOpen'),
          ('i-des', 'Design & UI/UX', 'Arts', 'Palette');

        INSERT INTO user_interests (user_id, interest_id) VALUES
          ('u1', 'i-rb'),
          ('u2', 'i-wp'),
          ('u2', 'i-r-new'),
          ('u3', 'i-des');
      `);

      // Run migration 011 via runMigrations (must not throw ER_CANT_AGGREGATE_2COLLATIONS)
      await runMigrations({ database: COLLATION_DB });

      // Verify migration 011 was recorded in schema_migrations
      const [applied011] = await cConn.query(
        'SELECT version FROM schema_migrations WHERE version = "011_merge_duplicate_interests.sql"'
      );
      expect((applied011 as any[]).length).toBe(1);

      // Verify user interests after merge
      const [u1Interests] = await cConn.query<any[]>(
        'SELECT i.name FROM user_interests ui JOIN interests i ON i.id = ui.interest_id WHERE ui.user_id = "u1"'
      );
      expect(u1Interests.map((r) => r.name)).toEqual(['Reading']);

      const [u2Interests] = await cConn.query<any[]>(
        'SELECT i.name FROM user_interests ui JOIN interests i ON i.id = ui.interest_id WHERE ui.user_id = "u2"'
      );
      // u2 must have exactly 1 'Reading' entry without duplicates
      expect(u2Interests.map((r) => r.name)).toEqual(['Reading']);

      const [u3Interests] = await cConn.query<any[]>(
        'SELECT i.name FROM user_interests ui JOIN interests i ON i.id = ui.interest_id WHERE ui.user_id = "u3"'
      );
      expect(u3Interests.map((r) => r.name)).toEqual(['Art']);

      // Verify old interests are removed
      const [oldInterests] = await cConn.query<any[]>(
        'SELECT name FROM interests WHERE name IN ("Reading & Books", "Writing & Poetry", "Design & UI/UX")'
      );
      expect(oldInterests.length).toBe(0);

      // Verify repeated run is completely idempotent
      await expect(runMigrations({ database: COLLATION_DB })).resolves.not.toThrow();
    } finally {
      await cConn.query(`DROP DATABASE IF EXISTS \`${COLLATION_DB}\``).catch(() => undefined);
      await cConn.end();
    }
  });

  it('safely applies migration 012 on fresh and partially migrated messages schema, preserving records and idempotency', async () => {
    const MSG_DB = config.mariadb.database.replace(/_test_db$/, '_msg_migration_test_db');
    const admin = await mysql.createConnection(mariaConnectionOptions({ withDatabase: false }));
    await admin.query(`DROP DATABASE IF EXISTS \`${MSG_DB}\``);
    await admin.query(`CREATE DATABASE \`${MSG_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.end();

    const mConn = await mysql.createConnection({
      ...mariaConnectionOptions(),
      database: MSG_DB,
      multipleStatements: true,
    });

    try {
      await mConn.query(
        `CREATE TABLE schema_migrations (version VARCHAR(255) PRIMARY KEY, applied_at DATETIME NOT NULL);`
      );

      // Run migrations 001 through 011
      const earlyMigrations = [
        '001_baseline.sql',
        '002_server_sessions.sql',
        '003_password_credentials_to_auth_accounts.sql',
        '004_drop_legacy_user_credentials.sql',
        '005_index_cleanup.sql',
        '006_places_and_education.sql',
        '007_profile_details.sql',
        '008_education_level_profession_field.sql',
        '009_notifications.sql',
        '010_phone_sign_in.sql',
        '011_merge_duplicate_interests.sql',
      ];
      for (const m of earlyMigrations) {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, m), 'utf-8');
        await mConn.query(sql);
        await mConn.query('INSERT INTO schema_migrations VALUES (?, UTC_TIMESTAMP())', [m]);
      }

      // Insert test user, conversation, and message before migration 012
      await mConn.query(`
        INSERT INTO users (id, email, is_active, created_at) VALUES
          ('u-caller', 'caller@example.com', 1, '2025-01-01T00:00:00.000Z'),
          ('u-callee', 'callee@example.com', 1, '2025-01-01T00:00:00.000Z');
        INSERT INTO conversations (id, user_a_id, user_b_id, created_at) VALUES
          ('c-1', 'u-caller', 'u-callee', '2025-01-01T00:00:00.000Z');
        INSERT INTO messages (id, conversation_id, sender_id, content, status, created_at) VALUES
          ('m-existing', 'c-1', 'u-caller', 'Hey there!', 'sent', '2025-01-01T00:00:00.000Z');

      `);

      // Simulate partial execution:
      // 'kind' and 'call_mode' were added previously, but 'call_outcome' and 'call_seconds' are missing
      await mConn.query(`
        ALTER TABLE messages
          ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'text',
          ADD COLUMN call_mode VARCHAR(8) NULL DEFAULT NULL;
        UPDATE messages SET kind = 'call', call_mode = 'video' WHERE id = 'm-existing';
      `);

      // Verify partial state before running migration 012
      const [colsBefore] = await mConn.query<any[]>(
        'SELECT column_name AS name FROM information_schema.columns WHERE table_schema = ? AND table_name = "messages"',
        [MSG_DB]
      );
      const namesBefore = colsBefore.map((c) => c.name);
      expect(namesBefore).toContain('kind');
      expect(namesBefore).toContain('call_mode');
      expect(namesBefore).not.toContain('call_outcome');
      expect(namesBefore).not.toContain('call_seconds');

      // Now run migrations - migration 012 must succeed without ER_DUP_FIELDNAME or ER_PARSE_ERROR
      await runMigrations({ database: MSG_DB });

      // Verify migration 012 is recorded in schema_migrations
      const [applied012] = await mConn.query<any[]>(
        'SELECT version FROM schema_migrations WHERE version = "012_call_messages.sql"'
      );
      expect(applied012.length).toBe(1);

      // Verify all 4 columns now exist
      const [colsAfter] = await mConn.query<any[]>(
        'SELECT column_name AS name FROM information_schema.columns WHERE table_schema = ? AND table_name = "messages"',
        [MSG_DB]
      );
      const namesAfter = colsAfter.map((c) => c.name);
      expect(namesAfter).toContain('kind');
      expect(namesAfter).toContain('call_mode');
      expect(namesAfter).toContain('call_outcome');
      expect(namesAfter).toContain('call_seconds');

      // Verify existing row data was preserved
      const [msgRows] = await mConn.query<any[]>(
        'SELECT kind, call_mode, call_outcome, call_seconds, content FROM messages WHERE id = "m-existing"'
      );
      expect(msgRows[0].kind).toBe('call');
      expect(msgRows[0].call_mode).toBe('video');
      expect(msgRows[0].call_outcome).toBeNull();
      expect(msgRows[0].call_seconds).toBeNull();
      expect(msgRows[0].content).toBe('Hey there!');

      // Verify repeated run is completely idempotent
      await expect(runMigrations({ database: MSG_DB })).resolves.not.toThrow();
    } finally {
      await mConn.query(`DROP DATABASE IF EXISTS \`${MSG_DB}\``).catch(() => undefined);
      await mConn.end();
    }
  });
});


