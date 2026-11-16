import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('vendors')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('phone', 'varchar(15)', (col) => col.notNull().unique())
    .addColumn('business_name', 'varchar(100)', (col) => col.notNull())
    .addColumn('owner_name', 'varchar(100)', (col) => col.notNull())
    .addColumn('business_type', 'varchar(30)', (col) => col.notNull().defaultTo('other'))
    .addColumn('city', 'varchar(50)')
    .addColumn('edition', 'varchar(10)', (col) => col.notNull().defaultTo('cloud'))
    .addColumn('subscription_status', 'varchar(20)', (col) => col.notNull().defaultTo('trial'))
    .addColumn('subscription_expires_at', 'timestamptz')
    .addColumn('daily_token_counter', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('token_reset_date', 'date', (col) => col.notNull().defaultTo(sql`CURRENT_DATE`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`NOW()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`NOW()`))
    .execute();

  await db.schema
    .createIndex('idx_vendors_phone')
    .on('vendors')
    .column('phone')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('vendors').ifExists().cascade().execute();
}
