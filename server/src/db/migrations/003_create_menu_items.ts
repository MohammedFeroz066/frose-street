import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('menu_items')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('vendor_id', 'uuid', (col) => col.notNull().references('vendors.id').onDelete('cascade'))
    .addColumn('name', 'varchar(100)', (col) => col.notNull())
    .addColumn('price_paise', 'bigint', (col) => col.notNull()) // Non-negotiable integer paise
    .addColumn('category', 'varchar(50)')
    .addColumn('emoji_icon', 'varchar(10)')
    .addColumn('color_hex', 'varchar(7)', (col) => col.defaultTo('#10B981'))
    .addColumn('display_order', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('is_available', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('is_active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`NOW()`))
    .execute();

  await db.schema
    .createIndex('idx_menu_items_vendor_id')
    .on('menu_items')
    .column('vendor_id')
    .execute();

  await db.schema
    .createIndex('idx_menu_items_display_order')
    .on('menu_items')
    .columns(['vendor_id', 'display_order'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('menu_items').ifExists().cascade().execute();
}
