import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE vendors
      ADD COLUMN IF NOT EXISTS tax_mode VARCHAR(20) NOT NULL DEFAULT 'unregistered',
      ADD COLUMN IF NOT EXISTS gstin VARCHAR(15),
      ADD COLUMN IF NOT EXISTS fssai_number VARCHAR(14),
      ADD COLUMN IF NOT EXISTS gst_rate_bps INTEGER NOT NULL DEFAULT 500,
      ADD COLUMN IF NOT EXISTS stall_address VARCHAR(240);
  `.execute(db);

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_vendors_tax_mode'
          AND conrelid = 'vendors'::regclass
      ) THEN
        ALTER TABLE vendors
          ADD CONSTRAINT chk_vendors_tax_mode
          CHECK (tax_mode IN ('unregistered', 'composition', 'regular'));
      END IF;
    END $$;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE vendors
      DROP CONSTRAINT IF EXISTS chk_vendors_tax_mode;
  `.execute(db);

  await sql`
    ALTER TABLE vendors
      DROP COLUMN IF EXISTS stall_address,
      DROP COLUMN IF EXISTS gst_rate_bps,
      DROP COLUMN IF EXISTS fssai_number,
      DROP COLUMN IF EXISTS gstin,
      DROP COLUMN IF EXISTS tax_mode;
  `.execute(db);
}
