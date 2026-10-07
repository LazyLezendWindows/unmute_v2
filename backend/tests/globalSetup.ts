import mysql from 'mysql2/promise';
import { mariaConnectionOptions } from '../src/config/connection';
import { config } from '../src/config/env';

export async function setup() {
  const name = config.mariadb.database;
  if (!/^[a-zA-Z0-9_]+_test_db$/.test(name)) {
    throw new Error(`Refusing to run tests against non-test database "${name}"`);
  }
  const conn = await mysql.createConnection(mariaConnectionOptions({ withDatabase: false }));
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await conn.end();
  }
  // Keep explicitly selected databases for inspection; generated ones are disposable.
  if (!process.env.UNMUTE_TEST_DATABASE) return async () => {
    const cleanup = await mysql.createConnection(mariaConnectionOptions({ withDatabase: false }));
    try { await cleanup.query(`DROP DATABASE IF EXISTS \`${name}\``); }
    finally { await cleanup.end(); }
  };
}
