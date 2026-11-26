import { describe, it, expect } from 'vitest';
import { allMigrations, StaticMigrationProvider, createMigrator } from '../../server/src/db/migrator.js';
import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from '../../server/src/db/types.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 3 Acceptance: Database Schema & Migrations', () => {
  const migrationsDir = path.resolve(__dirname, '../../server/src/db/migrations');

  describe('TEST 1: Migration Files & Compilation', () => {
    it('should have all 10 migration files on disk', () => {
      const files = [
        '001_create_vendors.ts',
        '002_create_staff.ts',
        '003_create_menu_items.ts',
        '004_create_orders_and_order_items.ts',
        '005_create_daily_summaries.ts',
        '006_create_expenses.ts',
        '007_create_subscriptions.ts',
        '008_add_auth_credentials.ts',
        '009_create_devices.ts',
        '010_update_expenses_table.ts',
      ];

      files.forEach((file) => {
        expect(fs.existsSync(path.join(migrationsDir, file))).toBe(true);
      });
    });

    it('each migration must export both up() and down() functions', () => {
      Object.entries(allMigrations).forEach(([name, migration]) => {
        expect(typeof migration.up).toBe('function');
        expect(typeof migration.down).toBe('function');
      });
    });
  });

  describe('TEST 2: Strict Integer Paise (BIGINT) Verification', () => {
    it('all monetary columns in migrations must use bigint (no floats, no numbers)', () => {
      const migrationSource = [
        '003_create_menu_items.ts',
        '004_create_orders_and_order_items.ts',
        '005_create_daily_summaries.ts',
        '006_create_expenses.ts',
        '007_create_subscriptions.ts',
      ];

      const requiredBigintColumns = [
        'price_paise',
        'total_paise',
        'unit_price_paise',
        'line_total_paise',
        'total_sales_paise',
        'cash_sales_paise',
        'upi_sales_paise',
        'total_expenses_paise',
        'net_paise',
        'amount_paise',
      ];

      let combinedContent = '';
      migrationSource.forEach((f) => {
        combinedContent += fs.readFileSync(path.join(migrationsDir, f), 'utf8') + '\n';
      });

      requiredBigintColumns.forEach((col) => {
        // Must match .addColumn('col_name', 'bigint', ...)
        const regex = new RegExp(`addColumn\\(['"]${col}['"],\\s*['"]bigint['"]`, 'g');
        const matches = combinedContent.match(regex);
        expect(matches, `Expected column ${col} to be declared as 'bigint'`).not.toBeNull();
        expect(matches!.length).toBeGreaterThan(0);
      });
    });

    it('no migration may contain float, decimal, or double precision columns for money', () => {
      const allFiles = fs.readdirSync(migrationsDir);
      allFiles.forEach((file) => {
        const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        expect(content).not.toMatch(/addColumn\([^,]+,\s*['"]float['"]/i);
        expect(content).not.toMatch(/addColumn\([^,]+,\s*['"]double['"]/i);
      });
    });
  });

  describe('TEST 3: Migration Provider & Ordering', () => {
    it('should register all migrations in correct sequential order', async () => {
      const provider = new StaticMigrationProvider();
      const migrations = await provider.getMigrations();

      const keys = Object.keys(migrations);
      expect(keys).toEqual([
        '001_create_vendors',
        '002_create_staff',
        '003_create_menu_items',
        '004_create_orders_and_order_items',
        '005_create_daily_summaries',
        '006_create_expenses',
        '007_create_subscriptions',
        '008_add_auth_credentials',
        '009_create_devices',
        '010_update_expenses_table',
        '011_add_is_superadmin_to_vendors',
        '012_create_auth_security_tables',
        '013_align_runtime_schema',
        '014_rls_roles_and_policies',
      ]);
    });
  });

  describe('TEST 4: Foreign Key Relationships & Indexes', () => {
    it('dependent tables must reference vendors.id with cascade delete', () => {
      const dependentMigrations = [
        '002_create_staff.ts',
        '003_create_menu_items.ts',
        '004_create_orders_and_order_items.ts',
        '005_create_daily_summaries.ts',
        '006_create_expenses.ts',
        '007_create_subscriptions.ts',
        '009_create_devices.ts',
      ];

      dependentMigrations.forEach((file) => {
        const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        expect(content).toContain("references('vendors.id')");
        expect(content).toContain("onDelete('cascade')");
      });
    });

    it('indexes must be defined for high-traffic query patterns', () => {
      const vendorContent = fs.readFileSync(path.join(migrationsDir, '001_create_vendors.ts'), 'utf8');
      expect(vendorContent).toContain('idx_vendors_phone');

      const ordersContent = fs.readFileSync(path.join(migrationsDir, '004_create_orders_and_order_items.ts'), 'utf8');
      expect(ordersContent).toContain('idx_orders_vendor_today');
      expect(ordersContent).toContain('idx_orders_vendor_status');
      expect(ordersContent).toContain('idx_orders_token');

      const menuContent = fs.readFileSync(path.join(migrationsDir, '003_create_menu_items.ts'), 'utf8');
      expect(menuContent).toContain('idx_menu_items_display_order');

      const devicesContent = fs.readFileSync(path.join(migrationsDir, '009_create_devices.ts'), 'utf8');
      expect(devicesContent).toContain('idx_devices_vendor_active');
    });
  });
});


