import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('expenses')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('vendor_id', 'uuid', (col) => col.notNull().references('vendors.id').onDelete('cascade'))
    .addColumn('amount_paise', 'bigint', (col) => col.notNull()) // Non-negotiable integer paise
    .addColumn('description', 'varchar(200)', (col) => col.notNull())
    .addColumn('expense_date', 'date', (col) => col.notNull().defaultTo(sql`CURRENT_DATE`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`NOW()`))
    .execute();

  await db.schema
    .createIndex('idx_expenses_vendor_date')
    .on('expenses')
    .columns(['vendor_id', 'expense_date'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('expenses').ifExists().cascade().execute();
}
