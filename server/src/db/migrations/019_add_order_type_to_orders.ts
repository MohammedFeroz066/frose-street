import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) NOT NULL DEFAULT 'dinein';
  `.execute(db);

  await sql`
    UPDATE orders
    SET order_type = 'parcel'
    WHERE order_type = 'dinein'
      AND (
        LOWER(COALESCE(notes, '')) LIKE '%parcel%'
        OR LOWER(COALESCE(notes, '')) LIKE '%takeaway%'
        OR LOWER(COALESCE(notes, '')) LIKE '%pack%'
      );
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE orders
      DROP COLUMN IF EXISTS order_type;
  `.execute(db);
}
