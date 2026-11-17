import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './types.js';
import { loadConfig } from '../config/env.js';
import { createMemoryDb } from './memory-db.js';

const { Pool } = pg;

let dbInstance: Kysely<Database> | null = null;

export function getDatabase(customConnectionString?: string): Kysely<Database> {
  if (dbInstance && !customConnectionString) {
    return dbInstance;
  }

  const config = loadConfig();
  const connectionString = customConnectionString || config.DATABASE_URL;

  // Resilient memory database mode when PostgreSQL is absent or requested
  if (process.env.USE_MEMORY_DB === 'true' || connectionString === ':memory:') {
    const memoryDb = createMemoryDb();
    if (!customConnectionString) {
      dbInstance = memoryDb;
    }
    return memoryDb;
  }

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
