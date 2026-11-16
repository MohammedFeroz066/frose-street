import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('devices')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('vendor_id', 'uuid', (col) => col.notNull().references('vendors.id').onDelete('cascade'))
    .addColumn('device_name', 'varchar(100)', (col) => col.notNull().defaultTo('Counter Device'))
    .addColumn('role', 'varchar(20)', (col) => col.notNull())
    .addColumn('token_hash', 'varchar(255)', (col) => col.notNull())
    .addColumn('is_active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('last_seen_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`NOW()`))
    .execute();

  await db.schema
    .createIndex('idx_devices_vendor_active')
    .on('devices')
    .columns(['vendor_id', 'is_active'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('devices').ifExists().cascade().execute();
}
