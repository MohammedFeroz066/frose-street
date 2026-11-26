import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS cash_paise INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS upi_paise INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS edit_note VARCHAR(240);
  `.execute(db);

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_orders_payment_method'
          AND conrelid = 'orders'::regclass
      ) THEN
        ALTER TABLE orders
          ADD CONSTRAINT chk_orders_payment_method
          CHECK (payment_method IN ('cash', 'upi', 'split'));
      END IF;
    END $$;
  `.execute(db);

  await sql`
    ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS is_veg BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS variants_json JSONB;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE menu_items
      DROP COLUMN IF EXISTS variants_json,
      DROP COLUMN IF EXISTS is_veg;
  `.execute(db);

  await sql`
    ALTER TABLE orders
      DROP CONSTRAINT IF EXISTS chk_orders_payment_method;
  `.execute(db);

  await sql`
    ALTER TABLE orders
      DROP COLUMN IF EXISTS edit_note,
      DROP COLUMN IF EXISTS edited_at,
      DROP COLUMN IF EXISTS upi_paise,
      DROP COLUMN IF EXISTS cash_paise;
  `.execute(db);
}
