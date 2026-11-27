import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // 1. Support suspended reason & configurable monthly plan fee (integer paise) on vendors
  await sql`
    ALTER TABLE vendors
      ADD COLUMN IF NOT EXISTS suspended_reason VARCHAR(240),
      ADD COLUMN IF NOT EXISTS monthly_fee_paise BIGINT NOT NULL DEFAULT 49900;
  `.execute(db);

  // 2. Create immutable Super Admin audit trail table
  await db.schema
    .createTable('admin_audit_logs')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('admin_id', 'varchar(64)', (col) => col.notNull())
    .addColumn('action', 'varchar(80)', (col) => col.notNull())
    .addColumn('target_vendor_id', 'varchar(64)')
    .addColumn('details_json', 'text')
    .addColumn('ip_address', 'varchar(64)')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`NOW()`))
    .execute();

  await db.schema
    .createIndex('idx_admin_audit_logs_created_at')
    .ifNotExists()
    .on('admin_audit_logs')
    .column('created_at')
    .execute();

  await db.schema
    .createIndex('idx_admin_audit_logs_target_vendor')
    .ifNotExists()
    .on('admin_audit_logs')
    .column('target_vendor_id')
    .execute();

  // 3. Explicit app_user grants & strict Superadmin-only RLS policy
  await sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        GRANT SELECT, INSERT ON TABLE admin_audit_logs TO app_user;
      END IF;
    END $$;
  `.execute(db);

  await sql`ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE admin_audit_logs FORCE ROW LEVEL SECURITY`.execute(db);
  await sql`DROP POLICY IF EXISTS tenant_isolation_admin_audit_logs ON admin_audit_logs`.execute(db);
  await sql`
    CREATE POLICY tenant_isolation_admin_audit_logs ON admin_audit_logs
      FOR ALL
      TO PUBLIC
      USING (current_setting('app.is_superadmin', true) = 'true')
      WITH CHECK (current_setting('app.is_superadmin', true) = 'true')
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP POLICY IF EXISTS tenant_isolation_admin_audit_logs ON admin_audit_logs`.execute(db);
  await db.schema.dropTable('admin_audit_logs').ifExists().cascade().execute();
  await sql`
    ALTER TABLE vendors
      DROP COLUMN IF EXISTS monthly_fee_paise,
      DROP COLUMN IF EXISTS suspended_reason;
  `.execute(db);
}
