import { Migrator, Migration, MigrationProvider, Kysely } from 'kysely';
import type { Database } from './types.js';

import * as m001 from './migrations/001_create_vendors.js';
import * as m002 from './migrations/002_create_staff.js';
import * as m003 from './migrations/003_create_menu_items.js';
import * as m004 from './migrations/004_create_orders_and_order_items.js';
import * as m005 from './migrations/005_create_daily_summaries.js';
import * as m006 from './migrations/006_create_expenses.js';
import * as m007 from './migrations/007_create_subscriptions.js';
import * as m008 from './migrations/008_add_auth_credentials.js';
import * as m009 from './migrations/009_create_devices.js';
import * as m010 from './migrations/010_update_expenses_table.js';
import * as m011 from './migrations/011_add_is_superadmin_to_vendors.js';
import * as m012 from './migrations/012_create_auth_security_tables.js';
import * as m013 from './migrations/013_align_runtime_schema.js';
import * as m014 from './migrations/014_rls_roles_and_policies.js';
import * as m015 from './migrations/015_add_client_order_id_to_orders.js';
import * as m016 from './migrations/016_add_vendor_compliance_fields.js';

export const allMigrations: Record<string, Migration> = {
  '001_create_vendors': m001,
  '002_create_staff': m002,
  '003_create_menu_items': m003,
  '004_create_orders_and_order_items': m004,
  '005_create_daily_summaries': m005,
  '006_create_expenses': m006,
  '007_create_subscriptions': m007,
  '008_add_auth_credentials': m008,
  '009_create_devices': m009,
  '010_update_expenses_table': m010,
  '011_add_is_superadmin_to_vendors': m011,
  '012_create_auth_security_tables': m012,
  '013_align_runtime_schema': m013,
  '014_rls_roles_and_policies': m014,
  '015_add_client_order_id_to_orders': m015,
  '016_add_vendor_compliance_fields': m016,
};

export class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return allMigrations;
  }
}

export function createMigrator(db: Kysely<Database>): Migrator {
  return new Migrator({
    db,
    provider: new StaticMigrationProvider(),
  });
}

export async function migrateToLatest(db: Kysely<Database>) {
  const migrator = createMigrator(db);
  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(`✅ Migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === 'Error') {
      console.error(`❌ Failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error('Migration failed:', error);
    throw error;
  }

  return results;
}

export async function migrateDown(db: Kysely<Database>) {
  const migrator = createMigrator(db);
  const { error, results } = await migrator.migrateDown();

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(`⏪ Reverted migration "${it.migrationName}"`);
    } else if (it.status === 'Error') {
      console.error(`❌ Failed to revert migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error('Rollback failed:', error);
    throw error;
  }

  return results;
}
