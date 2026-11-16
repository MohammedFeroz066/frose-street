import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './types.js';
import { loadConfig } from '../config/env.js';

const { Pool } = pg;

let dbInstance: Kysely<Database> | null = null;

export function getDatabase(customConnectionString?: string): Kysely<Database> {
  if (dbInstance && !customConnectionString) {
    return dbInstance;
  }

  const config = loadConfig();
  const connectionString = customConnectionString || config.DATABASE_URL;

  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });

  if (!customConnectionString) {
    dbInstance = db;
  }

  return db;
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.destroy();
    dbInstance = null;
  }
}
