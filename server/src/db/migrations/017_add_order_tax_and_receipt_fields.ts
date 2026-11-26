import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(32),
      ADD COLUMN IF NOT EXISTS subtotal_paise INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cgst_paise INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS sgst_paise INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS tax_mode_snapshot VARCHAR(20) NOT NULL DEFAULT 'unregistered',
      ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(200);
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_vendor_receipt_number
      ON orders (vendor_id, receipt_number)
      WHERE receipt_number IS NOT NULL;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS uq_orders_vendor_receipt_number;`.execute(db);

  await sql`
    ALTER TABLE orders
      DROP COLUMN IF EXISTS cancel_reason,
      DROP COLUMN IF EXISTS tax_mode_snapshot,
      DROP COLUMN IF EXISTS sgst_paise,
      DROP COLUMN IF EXISTS cgst_paise,
      DROP COLUMN IF EXISTS subtotal_paise,
      DROP COLUMN IF EXISTS receipt_number;
  `.execute(db);
}
