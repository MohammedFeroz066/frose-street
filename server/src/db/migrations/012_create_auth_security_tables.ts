import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Table for persistent rate limiting & lockout (account and IP)
  await db.schema
    .createTable('login_lockouts')
    .ifNotExists()
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('key_type', 'varchar(16)', (col) => col.notNull()) // 'account' or 'ip'
    .addColumn('key_value', 'varchar(64)', (col) => col.notNull())
    .addColumn('consecutive_failures', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('locked_until', 'timestamptz')
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Table for rotating refresh tokens with server-side revocation family
  await db.schema
    .createTable('refresh_tokens')
    .ifNotExists()
    .addColumn('id', 'varchar(64)', (col) => col.primaryKey())
    .addColumn('vendor_id', 'varchar(64)', (col) => col.notNull())
    .addColumn('token_hash', 'varchar(64)', (col) => col.notNull().unique())
    .addColumn('family_id', 'varchar(64)', (col) => col.notNull())
    .addColumn('is_revoked', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('refresh_tokens').ifExists().execute();
  await db.schema.dropTable('login_lockouts').ifExists().execute();
}
