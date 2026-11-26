import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS client_order_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS created_at_client TIMESTAMPTZ;
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_vendor_client_order_id
      ON orders (vendor_id, client_order_id)
      WHERE client_order_id IS NOT NULL;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS uq_orders_vendor_client_order_id;`.execute(db);
  await sql`
    ALTER TABLE orders
      DROP COLUMN IF EXISTS created_at_client,
      DROP COLUMN IF EXISTS client_order_id;
  `.execute(db);
}
