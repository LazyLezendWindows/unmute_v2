import fs from 'fs';
import mysql from 'mysql2/promise';
import { config } from './env';

/** Connection options shared by the app pool, the migrator and test setup. */
export function mariaConnectionOptions({ withDatabase = true } = {}): mysql.ConnectionOptions {
  const dbUrl = process.env.DATABASE_URL || process.env.MARIADB_URL;
  if (dbUrl) {
    try {
      const parsed = new URL(dbUrl);
      const opts: mysql.ConnectionOptions = {
        host: parsed.hostname,
        port: parseInt(parsed.port || '3306', 10),
        // Stored times are UTC (UTC_TIMESTAMP()); read and write them as UTC, whatever the server's own time zone.
        timezone: 'Z',
        user: decodeURIComponent(parsed.username || ''),
        password: decodeURIComponent(parsed.password || ''),
        // An explicit database override must also apply to URL connections. Test/reset tools
        // validate MARIADB_DATABASE before clearing tables, so ignoring it could erase app data.
        ...(withDatabase
          ? { database: process.env.MARIADB_DATABASE || decodeURIComponent(parsed.pathname.replace(/^\//, '')) || config.mariadb.database }
          : {}),
      };
      if (
        parsed.searchParams.get('ssl') === 'true' ||
        parsed.searchParams.get('ssl-mode') ||
        process.env.MARIADB_SSL === 'true' ||
        config.isProduction
      ) {
        opts.ssl = { rejectUnauthorized: false };
      }
      return opts;
    } catch {
      // URL parser errors can include credentials from the rejected URL.
      console.warn('[DB] Failed to parse database URL, falling back to individual variables.');
    }
  }

  const opts: mysql.ConnectionOptions = {
    // Stored times are UTC (UTC_TIMESTAMP()); read and write them as UTC, whatever the server's own time zone.
    timezone: 'Z',
    user: config.mariadb.user,
    password: config.mariadb.password,
    ...(withDatabase ? { database: config.mariadb.database } : {}),
  };

  if (fs.existsSync(config.mariadb.socketPath)) {
    opts.socketPath = config.mariadb.socketPath;
  } else {
    opts.host = config.mariadb.host;
    opts.port = config.mariadb.port;
    if (process.env.MARIADB_SSL === 'true') {
      opts.ssl = { rejectUnauthorized: false };
    }
  }
  return opts;
}
