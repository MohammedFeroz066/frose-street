import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // 1. Add nullable 4-digit Owner PIN hash on vendors (in-session authorization only)
  await sql`
    ALTER TABLE vendors
      ADD COLUMN IF NOT EXISTS owner_pin_hash TEXT;
  `.execute(db);

  // 2. Create profit_adjustments table with BIGINT integer paise and strict tenant RLS
  await sql`
    CREATE TABLE IF NOT EXISTS profit_adjustments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      business_date DATE NOT NULL,
      amount_paise BIGINT NOT NULL,
      note TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_profit_adjustments_vendor_date
      ON profit_adjustments (vendor_id, business_date);
  `.execute(db);

  await sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE profit_adjustments TO app_user;
      END IF;
    END $$;
  `.execute(db);

  await sql`ALTER TABLE profit_adjustments ENABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE profit_adjustments FORCE ROW LEVEL SECURITY`.execute(db);
  await sql`DROP POLICY IF EXISTS tenant_isolation_profit_adjustments ON profit_adjustments`.execute(db);
  await sql`
    CREATE POLICY tenant_isolation_profit_adjustments ON profit_adjustments
      FOR ALL
      TO PUBLIC
      USING (
        current_setting('app.is_superadmin', true) = 'true'
        OR vendor_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
      )
      WITH CHECK (
        current_setting('app.is_superadmin', true) = 'true'
        OR vendor_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
      );
  `.execute(db);

  // 3. Per-item fulfillment tracking on order_items
  await sql`
    ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS kitchen_ready BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS kitchen_ready_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS packaging_ready BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS packaging_ready_at TIMESTAMPTZ;
  `.execute(db);

  // Ensure ready_at and delivered_at exist on orders
  await sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE order_items
      DROP COLUMN IF EXISTS packaging_ready_at,
      DROP COLUMN IF EXISTS packaging_ready,
      DROP COLUMN IF EXISTS kitchen_ready_at,
      DROP COLUMN IF EXISTS kitchen_ready;
  `.execute(db);

  await sql`DROP POLICY IF EXISTS tenant_isolation_profit_adjustments ON profit_adjustments`.execute(db);
  await sql`DROP TABLE IF EXISTS profit_adjustments CASCADE`.execute(db);

  await sql`
    ALTER TABLE vendors
      DROP COLUMN IF EXISTS owner_pin_hash;
  `.execute(db);
}
