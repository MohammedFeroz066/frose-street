import { sql, type Kysely } from 'kysely';
import type { Database } from './types.js';
import { getDatabase } from './database.js';

function isTransactionalPostgres(db: Kysely<Database>): boolean {
  return (
    process.env.USE_MEMORY_DB !== 'true' &&
    typeof (db as any)?.transaction === 'function'
  );
}

/**
 * Executes `fn` inside a PostgreSQL transaction with transaction-local
 * `app.current_tenant_id` (equivalent to `SET LOCAL`) and `app.is_superadmin = 'false'`.
 * Pooled connections automatically reset local GUCs at transaction end.
 */
export async function withTenantContext<T>(
  vendorId: string,
  fn: (db: Kysely<Database>) => Promise<T>,
  customDb?: Kysely<Database>,
): Promise<T> {
  if (!vendorId || typeof vendorId !== 'string') {
    throw new Error('withTenantContext requires a non-empty vendorId');
  }

  const db = customDb || getDatabase();
  if (!isTransactionalPostgres(db)) {
    return fn(db);
  }

  return db.transaction().execute(async (trx) => {
    await sql`SELECT set_config('app.is_superadmin', 'false', true)`.execute(trx);
    await sql`SELECT set_config('app.current_tenant_id', ${vendorId}, true)`.execute(trx);
    return fn(trx);
  });
}

/**
 * Executes `fn` inside a PostgreSQL transaction with transaction-local
 * `app.is_superadmin = 'true'` ONLY for verified superadmin / admin CLI flows.
 */
export async function withSuperadminContext<T>(
  fn: (db: Kysely<Database>) => Promise<T>,
  customDb?: Kysely<Database>,
): Promise<T> {
  const db = customDb || getDatabase();
  if (!isTransactionalPostgres(db)) {
    return fn(db);
  }

  return db.transaction().execute(async (trx) => {
    await sql`SELECT set_config('app.current_tenant_id', '', true)`.execute(trx);
    await sql`SELECT set_config('app.is_superadmin', 'true', true)`.execute(trx);
    return fn(trx);
  });
}

/**
 * Auth-bootstrap lookup for vendor by phone via minimal SECURITY DEFINER function
 * in PostgreSQL (never grants broad SELECT on vendors without tenant context).
 */
export async function lookupVendorByPhone(db: Kysely<Database>, phone: string): Promise<any | undefined> {
  if (!isTransactionalPostgres(db)) {
    return db
      .selectFrom('vendors')
      .selectAll()
      .where('phone', '=', phone)
      .executeTakeFirst();
  }

  const res = await sql<any>`SELECT * FROM auth_lookup_vendor_by_phone(${phone})`.execute(db);
  return res.rows[0];
}

/**
 * Auth-bootstrap lookup for refresh token by SHA-256 hash via minimal SECURITY DEFINER function.
 */
export async function lookupRefreshTokenByHash(db: Kysely<Database>, tokenHash: string): Promise<any | undefined> {
  if (!isTransactionalPostgres(db)) {
    return db
      .selectFrom('refresh_tokens')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();
  }

  const res = await sql<any>`SELECT * FROM auth_lookup_refresh_token(${tokenHash})`.execute(db);
  return res.rows[0];
}

/**
 * Auth-bootstrap lookup for WebAuthn biometric credential via minimal SECURITY DEFINER function.
 */
export async function lookupBiometricByCredentialId(
  db: Kysely<Database>,
  credentialId: string,
): Promise<any | undefined> {
  if (!isTransactionalPostgres(db)) {
    return db
      .selectFrom('biometric_credentials')
      .innerJoin('vendors', 'vendors.id', 'biometric_credentials.vendor_id')
      .select([
        'vendors.id',
        'vendors.phone',
        'vendors.business_name',
        'vendors.edition',
        'vendors.subscription_status',
        'biometric_credentials.id as biometric_id',
      ])
      .where('biometric_credentials.credential_id', '=', credentialId)
      .executeTakeFirst();
  }

  const res = await sql<any>`SELECT * FROM auth_lookup_biometric_by_credential_id(${credentialId})`.execute(db);
  return res.rows[0];
}
