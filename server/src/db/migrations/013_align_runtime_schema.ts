import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // 1. Align menu_items with MenuService / AdminService runtime queries
  await sql`
    ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS image_url TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `.execute(db);

  // 2. Align orders with OrderService / GallaService / AdminService runtime queries
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'token_number'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'token_no'
      ) THEN
        ALTER TABLE orders RENAME COLUMN token_number TO token_no;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'status'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_status'
      ) THEN
        ALTER TABLE orders RENAME COLUMN status TO order_status;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'placed_at'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'created_at'
      ) THEN
        ALTER TABLE orders RENAME COLUMN placed_at TO created_at;
      END IF;
    END $$;
  `.execute(db);

  await sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'pos',
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `.execute(db);

  // 3. Align order_items with OrderService runtime inserts
  await sql`
    ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS notes VARCHAR(300);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE order_items DROP COLUMN IF EXISTS notes;
  `.execute(db);

  await sql`
    ALTER TABLE orders
      DROP COLUMN IF EXISTS updated_at,
      DROP COLUMN IF EXISTS source,
      DROP COLUMN IF EXISTS customer_name;
  `.execute(db);

  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'token_no'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'token_number'
      ) THEN
        ALTER TABLE orders RENAME COLUMN token_no TO token_number;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_status'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'status'
      ) THEN
        ALTER TABLE orders RENAME COLUMN order_status TO status;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'created_at'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'placed_at'
      ) THEN
        ALTER TABLE orders RENAME COLUMN created_at TO placed_at;
      END IF;
    END $$;
  `.execute(db);

  await sql`
    ALTER TABLE menu_items
      DROP COLUMN IF EXISTS updated_at,
      DROP COLUMN IF EXISTS image_url;
  `.execute(db);
}
