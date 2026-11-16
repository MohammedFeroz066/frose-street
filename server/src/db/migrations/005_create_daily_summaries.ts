import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('daily_summaries')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('vendor_id', 'uuid', (col) => col.notNull().references('vendors.id').onDelete('cascade'))
    .addColumn('summary_date', 'date', (col) => col.notNull())
    .addColumn('total_orders', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('total_sales_paise', 'bigint', (col) => col.notNull().defaultTo(0)) // Non-negotiable integer paise
    .addColumn('cash_sales_paise', 'bigint', (col) => col.notNull().defaultTo(0)) // Non-negotiable integer paise
    .addColumn('upi_sales_paise', 'bigint', (col) => col.notNull().defaultTo(0)) // Non-negotiable integer paise
    .addColumn('total_expenses_paise', 'bigint', (col) => col.notNull().defaultTo(0)) // Non-negotiable integer paise
    .addColumn('net_paise', 'bigint', (col) => col.notNull().defaultTo(0)) // Non-negotiable integer paise
    .addColumn('cancelled_orders', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('top_selling_item', 'varchar(100)')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`NOW()`))
    .execute();

  await db.schema
    .createIndex('idx_daily_summaries_vendor_date')
    .on('daily_summaries')
    .columns(['vendor_id', 'summary_date'])
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('daily_summaries').ifExists().cascade().execute();
}
