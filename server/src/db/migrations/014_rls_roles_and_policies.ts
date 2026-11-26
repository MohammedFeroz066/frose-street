import { Kysely, sql } from 'kysely';

const TENANT_UUID_TABLES = [
  'staff',
  'menu_items',
  'orders',
  'daily_summaries',
  'expenses',
  'subscriptions',
  'devices',
  'biometric_credentials',
] as const;

const ALL_TENANT_TABLES = [
  'vendors',
  ...TENANT_UUID_TABLES,
  'order_items',
  'refresh_tokens',
] as const;

function resolveAppUserPassword(): string | null {
  if (process.env.APP_USER_PASSWORD && process.env.APP_USER_PASSWORD.length > 0) {
    return process.env.APP_USER_PASSWORD;
  }
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const parsed = new URL(dbUrl);
      if (parsed.username === 'app_user' && parsed.password) {
        return decodeURIComponent(parsed.password);
      }
    } catch {
      // Ignore invalid URL
    }
  }
  return null;
}

export async function up(db: Kysely<any>): Promise<void> {
  // 1. Provision non-superuser, non-owner runtime role `app_user` with NOBYPASSRLS
  const appUserPassword = resolveAppUserPassword();
  if (appUserPassword) {
    await sql`SELECT set_config('app.bootstrap_app_user_pwd', ${appUserPassword}, true)`.execute(db);
  } else {
    await sql`SELECT set_config('app.bootstrap_app_user_pwd', '', true)`.execute(db);
  }

  await sql`
    DO $$
    DECLARE
      pwd text := NULLIF(current_setting('app.bootstrap_app_user_pwd', true), '');
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        IF pwd IS NOT NULL THEN
          EXECUTE format(
            'CREATE ROLE app_user WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD %L',
            pwd
          );
        ELSE
          CREATE ROLE app_user WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
        END IF;
      ELSE
        IF pwd IS NOT NULL THEN
          EXECUTE format(
            'ALTER ROLE app_user WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD %L',
            pwd
          );
        ELSE
          ALTER ROLE app_user WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
        END IF;
      END IF;
    END $$;
  `.execute(db);

  // 2. Least-privilege grants on application tables only (never Kysely migration tables, never ownership)
  await sql`GRANT USAGE ON SCHEMA public TO app_user`.execute(db);
  await sql`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_user`.execute(db);
  await sql`
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      vendors,
      staff,
      menu_items,
      orders,
      order_items,
      daily_summaries,
      expenses,
      subscriptions,
      devices,
      biometric_credentials,
      refresh_tokens,
      login_lockouts
    TO app_user
  `.execute(db);
  await sql`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user`.execute(db);

  // 3. Enable AND Force Row-Level Security on every tenant-scoped table
  await sql`ALTER TABLE vendors ENABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE vendors FORCE ROW LEVEL SECURITY`.execute(db);
  await sql`DROP POLICY IF EXISTS tenant_isolation_vendors ON vendors`.execute(db);
  await sql`
    CREATE POLICY tenant_isolation_vendors ON vendors
      FOR ALL
      TO PUBLIC
      USING (
        current_setting('app.is_superadmin', true) = 'true'
        OR id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
      )
      WITH CHECK (
        current_setting('app.is_superadmin', true) = 'true'
        OR id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
      )
  `.execute(db);

  for (const tbl of TENANT_UUID_TABLES) {
    await sql.raw(`ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY`).execute(db);
    await sql.raw(`ALTER TABLE ${tbl} FORCE ROW LEVEL SECURITY`).execute(db);
    await sql.raw(`DROP POLICY IF EXISTS tenant_isolation_${tbl} ON ${tbl}`).execute(db);
    await sql.raw(`
      CREATE POLICY tenant_isolation_${tbl} ON ${tbl}
        FOR ALL
        TO PUBLIC
        USING (
          current_setting('app.is_superadmin', true) = 'true'
          OR vendor_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        )
        WITH CHECK (
          current_setting('app.is_superadmin', true) = 'true'
          OR vendor_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        )
    `).execute(db);
  }

  // order_items inherits tenant isolation via orders.vendor_id
  await sql`ALTER TABLE order_items ENABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE order_items FORCE ROW LEVEL SECURITY`.execute(db);
  await sql`DROP POLICY IF EXISTS tenant_isolation_order_items ON order_items`.execute(db);
  await sql`
    CREATE POLICY tenant_isolation_order_items ON order_items
      FOR ALL
      TO PUBLIC
      USING (
        current_setting('app.is_superadmin', true) = 'true'
        OR EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = order_items.order_id
            AND o.vendor_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        )
      )
      WITH CHECK (
        current_setting('app.is_superadmin', true) = 'true'
        OR EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = order_items.order_id
            AND o.vendor_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        )
      )
  `.execute(db);

  // refresh_tokens.vendor_id is varchar(64)
  await sql`ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY`.execute(db);
  await sql`DROP POLICY IF EXISTS tenant_isolation_refresh_tokens ON refresh_tokens`.execute(db);
  await sql`
    CREATE POLICY tenant_isolation_refresh_tokens ON refresh_tokens
      FOR ALL
      TO PUBLIC
      USING (
        current_setting('app.is_superadmin', true) = 'true'
        OR vendor_id = NULLIF(current_setting('app.current_tenant_id', true), '')
      )
      WITH CHECK (
        current_setting('app.is_superadmin', true) = 'true'
        OR vendor_id = NULLIF(current_setting('app.current_tenant_id', true), '')
      )
  `.execute(db);

  // 4. Minimal SECURITY DEFINER auth-bootstrap lookup functions (no broad RLS bypass)
  await sql`
    CREATE OR REPLACE FUNCTION auth_lookup_vendor_by_phone(p_phone text)
    RETURNS TABLE (
      id uuid,
      phone varchar,
      business_name varchar,
      owner_name varchar,
      business_type varchar,
      city varchar,
      edition varchar,
      subscription_status varchar,
      subscription_expires_at timestamptz,
      daily_token_counter integer,
      token_reset_date date,
      password_hash varchar,
      quick_pin_hash varchar,
      is_superadmin boolean,
      created_at timestamptz,
      updated_at timestamptz
    )
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
      SELECT
        v.id,
        v.phone,
        v.business_name,
        v.owner_name,
        v.business_type,
        v.city,
        v.edition,
        v.subscription_status,
        v.subscription_expires_at,
        v.daily_token_counter,
        v.token_reset_date,
        v.password_hash,
        v.quick_pin_hash,
        v.is_superadmin,
        v.created_at,
        v.updated_at
      FROM vendors v
      WHERE v.phone = p_phone
      LIMIT 1;
    $$;
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION auth_lookup_refresh_token(p_token_hash text)
    RETURNS TABLE (
      id varchar,
      vendor_id varchar,
      token_hash varchar,
      family_id varchar,
      is_revoked boolean,
      expires_at timestamptz,
      created_at timestamptz
    )
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
      SELECT
        rt.id,
        rt.vendor_id,
        rt.token_hash,
        rt.family_id,
        rt.is_revoked,
        rt.expires_at,
        rt.created_at
      FROM refresh_tokens rt
      WHERE rt.token_hash = p_token_hash
      LIMIT 1;
    $$;
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION auth_lookup_biometric_by_credential_id(p_credential_id text)
    RETURNS TABLE (
      id uuid,
      phone varchar,
      business_name varchar,
      edition varchar,
      subscription_status varchar,
      biometric_id uuid
    )
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
      SELECT
        v.id,
        v.phone,
        v.business_name,
        v.edition,
        v.subscription_status,
        bc.id AS biometric_id
      FROM biometric_credentials bc
      INNER JOIN vendors v ON v.id = bc.vendor_id
      WHERE bc.credential_id = p_credential_id
      LIMIT 1;
    $$;
  `.execute(db);

  await sql`REVOKE ALL ON FUNCTION auth_lookup_vendor_by_phone(text) FROM PUBLIC`.execute(db);
  await sql`GRANT EXECUTE ON FUNCTION auth_lookup_vendor_by_phone(text) TO app_user`.execute(db);

  await sql`REVOKE ALL ON FUNCTION auth_lookup_refresh_token(text) FROM PUBLIC`.execute(db);
  await sql`GRANT EXECUTE ON FUNCTION auth_lookup_refresh_token(text) TO app_user`.execute(db);

  await sql`REVOKE ALL ON FUNCTION auth_lookup_biometric_by_credential_id(text) FROM PUBLIC`.execute(db);
  await sql`GRANT EXECUTE ON FUNCTION auth_lookup_biometric_by_credential_id(text) TO app_user`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP FUNCTION IF EXISTS auth_lookup_biometric_by_credential_id(text)`.execute(db);
  await sql`DROP FUNCTION IF EXISTS auth_lookup_refresh_token(text)`.execute(db);
  await sql`DROP FUNCTION IF EXISTS auth_lookup_vendor_by_phone(text)`.execute(db);

  for (const tbl of ALL_TENANT_TABLES) {
    await sql.raw(`DROP POLICY IF EXISTS tenant_isolation_${tbl} ON ${tbl}`).execute(db);
    await sql.raw(`ALTER TABLE ${tbl} NO FORCE ROW LEVEL SECURITY`).execute(db);
    await sql.raw(`ALTER TABLE ${tbl} DISABLE ROW LEVEL SECURITY`).execute(db);
  }
}
