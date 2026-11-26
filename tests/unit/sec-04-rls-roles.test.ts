import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { allMigrations, StaticMigrationProvider } from '../../server/src/db/migrator.js';

describe('SEC-04-RLS-ROLES: Migrations, app_user Role, and FORCE ROW LEVEL SECURITY', () => {
  const migrationsDir = path.resolve(__dirname, '../../server/src/db/migrations');
  const envExamplePath = path.resolve(__dirname, '../../.env.example');

  it('registers migrations 011, 012, 013, and 014 in sequential order', async () => {
    const provider = new StaticMigrationProvider();
    const migrations = await provider.getMigrations();
    const keys = Object.keys(migrations);

    expect(keys).toContain('011_add_is_superadmin_to_vendors');
    expect(keys).toContain('012_create_auth_security_tables');
    expect(keys).toContain('013_align_runtime_schema');
    expect(keys).toContain('014_rls_roles_and_policies');
    expect(keys.indexOf('014_rls_roles_and_policies')).toBeGreaterThan(keys.indexOf('013_align_runtime_schema'));
    expect(typeof allMigrations['014_rls_roles_and_policies']?.up).toBe('function');
    expect(typeof allMigrations['014_rls_roles_and_policies']?.down).toBe('function');
  });

  it('defines non-superuser app_user with NOBYPASSRLS and ENABLE + FORCE ROW LEVEL SECURITY on all 11 tenant tables', () => {
    const rlsMigration = fs.readFileSync(
      path.join(migrationsDir, '014_rls_roles_and_policies.ts'),
      'utf8',
    );

    expect(rlsMigration).toContain('app_user');
    expect(rlsMigration).toContain('NOSUPERUSER');
    expect(rlsMigration).toContain('NOBYPASSRLS');
    expect(rlsMigration).not.toMatch(/\bBYPASSRLS\b/);

    const directRlsTables = ['vendors', 'order_items', 'refresh_tokens'];
    const loopedUuidTables = [
      'staff',
      'menu_items',
      'orders',
      'daily_summaries',
      'expenses',
      'subscriptions',
      'devices',
      'biometric_credentials',
    ];

    for (const tbl of directRlsTables) {
      expect(rlsMigration, `Missing ENABLE RLS on ${tbl}`).toMatch(
        new RegExp(`ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY`, 'i'),
      );
      expect(rlsMigration, `Missing FORCE RLS on ${tbl}`).toMatch(
        new RegExp(`ALTER TABLE ${tbl} FORCE ROW LEVEL SECURITY`, 'i'),
      );
    }

    for (const tbl of loopedUuidTables) {
      expect(rlsMigration, `Missing ${tbl} in TENANT_UUID_TABLES`).toContain(`'${tbl}'`);
    }
    expect(rlsMigration).toContain('ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY');
    expect(rlsMigration).toContain('ALTER TABLE ${tbl} FORCE ROW LEVEL SECURITY');

    expect(rlsMigration).toContain("current_setting('app.current_tenant_id', true)");
    expect(rlsMigration).toContain("current_setting('app.is_superadmin', true)");
    expect(rlsMigration).toContain('SECURITY DEFINER');
  });

  it('.env.example separates runtime DATABASE_URL (app_user) and DATABASE_MIGRATION_URL (owner)', () => {
    const envExample = fs.readFileSync(envExamplePath, 'utf8');
    expect(envExample).toMatch(/^DATABASE_URL=postgresql:\/\/app_user:/m);
    expect(envExample).toMatch(/^DATABASE_MIGRATION_URL=postgresql:\/\//m);
  });
});
