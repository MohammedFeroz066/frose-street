import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('subscriptions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('vendor_id', 'uuid', (col) => col.notNull().references('vendors.id').onDelete('cascade'))
    .addColumn('plan', 'varchar(20)', (col) => col.notNull().defaultTo('cloud'))
    .addColumn('amount_paise', 'bigint', (col) => col.notNull()) // Non-negotiable integer paise
    .addColumn('period_start', 'date', (col) => col.notNull())
    .addColumn('period_end', 'date', (col) => col.notNull())
    .addColumn('payment_method', 'varchar(20)', (col) => col.notNull().defaultTo('upi'))
    .addColumn('payment_reference', 'varchar(100)')
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('active'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`NOW()`))
    .execute();

  await db.schema
    .createIndex('idx_subscriptions_vendor_status')
    .on('subscriptions')
    .columns(['vendor_id', 'status'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('subscriptions').ifExists().cascade().execute();
}
