import { Kysely, PostgresDialect, sql } from 'kysely';
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
    if (typeof (dbInstance as any).destroy === 'function') {
      await dbInstance.destroy();
    }
    dbInstance = null;
  }
}

export interface RuntimeDbRoleInfo {
  currentUser: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
}

/**
 * Verifies the active PostgreSQL role is neither `postgres`, a superuser (`rolsuper`),
 * nor a `BYPASSRLS` role (`rolbypassrls`). Fails startup in production; logs a hard warning otherwise.
 */
export async function verifyRuntimeDatabaseRole(
  customDb?: Kysely<Database>,
  nodeEnv: string = process.env.NODE_ENV || 'development',
): Promise<RuntimeDbRoleInfo> {
  if (process.env.USE_MEMORY_DB === 'true' && !customDb) {
    return { currentUser: 'memory', rolsuper: false, rolbypassrls: false };
  }

  const db = customDb || getDatabase();
  if (typeof (db as any)?.getExecutor !== 'function') {
    return { currentUser: 'memory', rolsuper: false, rolbypassrls: false };
  }

  const result = await sql<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>`
    SELECT current_user, rolsuper, rolbypassrls
    FROM pg_roles
    WHERE rolname = current_user
  `.execute(db);

  const row = result.rows[0];
  if (!row) {
    throw new Error('FATAL SECURITY ERROR: Unable to verify current PostgreSQL role privileges');
  }

  const info: RuntimeDbRoleInfo = {
    currentUser: String(row.current_user),
    rolsuper: Boolean(row.rolsuper),
    rolbypassrls: Boolean(row.rolbypassrls),
  };

  if (info.currentUser === 'postgres' || info.rolsuper || info.rolbypassrls) {
    const message =
      `Runtime database connection uses privileged role "${info.currentUser}" ` +
      `(rolsuper=${info.rolsuper}, rolbypassrls=${info.rolbypassrls}). Connect as non-superuser app_user so RLS is enforced.`;
    if (nodeEnv === 'production') {
      throw new Error(`FATAL SECURITY ERROR: ${message}`);
    }
    console.error(`[SECURITY WARNING] ${message}`);
  }

  return info;
}
