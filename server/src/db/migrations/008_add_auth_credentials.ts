import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // 1. Add authentication columns to vendors table
  await db.schema
    .alterTable('vendors')
    .addColumn('password_hash', 'varchar(255)')
    .addColumn('quick_pin_hash', 'varchar(255)')
    .execute();

  // 2. Add authentication columns to staff table
  await db.schema
    .alterTable('staff')
    .addColumn('password_hash', 'varchar(255)')
    .addColumn('quick_pin_hash', 'varchar(255)')
    .execute();

  // 3. Create biometric_credentials table for WebAuthn passkey registration
  await db.schema
    .createTable('biometric_credentials')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('vendor_id', 'uuid', (col) => col.notNull().references('vendors.id').onDelete('cascade'))
    .addColumn('credential_id', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('public_key', 'text', (col) => col.notNull())
    .addColumn('counter', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('device_name', 'varchar(100)', (col) => col.defaultTo('Mobile Device'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`NOW()`))
    .execute();

  await db.schema
    .createIndex('idx_biometric_vendor_id')
    .on('biometric_credentials')
    .column('vendor_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('biometric_credentials').ifExists().cascade().execute();
  await db.schema.alterTable('vendors').dropColumn('quick_pin_hash').dropColumn('password_hash').execute();
  await db.schema.alterTable('staff').dropColumn('quick_pin_hash').dropColumn('password_hash').execute();
}
