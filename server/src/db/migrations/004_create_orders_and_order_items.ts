import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // 1. Orders Table
  await db.schema
    .createTable('orders')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('vendor_id', 'uuid', (col) => col.notNull().references('vendors.id').onDelete('cascade'))
    .addColumn('token_number', 'integer', (col) => col.notNull())
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('placed'))
    .addColumn('payment_method', 'varchar(10)', (col) => col.notNull().defaultTo('cash'))
    .addColumn('payment_status', 'varchar(20)', (col) => col.notNull().defaultTo('pending'))
    .addColumn('total_paise', 'bigint', (col) => col.notNull()) // Non-negotiable integer paise
    .addColumn('upi_transaction_id', 'varchar(100)')
    .addColumn('customer_phone', 'varchar(15)')
    .addColumn('notes', 'varchar(200)')
    .addColumn('placed_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`NOW()`))
    .addColumn('ready_at', 'timestamptz')
    .addColumn('delivered_at', 'timestamptz')
    .addColumn('created_by_staff_id', 'uuid', (col) => col.references('staff.id').onDelete('set null'))
    .execute();

  await db.schema
    .createIndex('idx_orders_vendor_today')
    .on('orders')
    .columns(['vendor_id', 'placed_at'])
    .execute();

  await db.schema
    .createIndex('idx_orders_vendor_status')
    .on('orders')
    .columns(['vendor_id', 'status'])
    .execute();

  await db.schema
    .createIndex('idx_orders_token')
    .on('orders')
    .columns(['vendor_id', 'token_number'])
    .execute();

  // 2. Order Items Table
  await db.schema
    .createTable('order_items')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('order_id', 'uuid', (col) => col.notNull().references('orders.id').onDelete('cascade'))
    .addColumn('menu_item_id', 'uuid', (col) => col.notNull().references('menu_items.id'))
    .addColumn('item_name', 'varchar(100)', (col) => col.notNull())
    .addColumn('quantity', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('unit_price_paise', 'bigint', (col) => col.notNull()) // Non-negotiable integer paise
    .addColumn('line_total_paise', 'bigint', (col) => col.notNull()) // Non-negotiable integer paise
    .execute();

  await db.schema
    .createIndex('idx_order_items_order_id')
    .on('order_items')
    .column('order_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('order_items').ifExists().cascade().execute();
  await db.schema.dropTable('orders').ifExists().cascade().execute();
}
