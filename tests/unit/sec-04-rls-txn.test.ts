import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyRuntimeDatabaseRole } from '../../server/src/db/database.js';
import { withTenantContext, withSuperadminContext } from '../../server/src/db/rls-context.js';

function createFakeExecutorDb(rowsFn: (compiled: any) => any[]) {
  const executor = {
    compileQuery: (node: any) => ({
      sql: Array.isArray(node?.sqlFragments) ? node.sqlFragments.join('?') : String(node?.sql || ''),
      parameters: node?.parameters || [],
    }),
    transformQuery: (node: any) => node,
    executeQuery: vi.fn(async (compiled: any) => ({ rows: rowsFn(compiled) })),
    withPlugin: () => executor,
  };
  return {
    getExecutor: () => executor,
    executor,
  };
}

describe('SEC-04-RLS-TXN: Transaction-Local SET LOCAL & Superuser Startup Guard', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('withTenantContext sets app.current_tenant_id strictly transaction-locally (is_local=true) and resets superadmin flag', async () => {
    process.env.USE_MEMORY_DB = 'false';
    const executedQueries: string[] = [];

    const fakeTrx = createFakeExecutorDb((compiled) => {
      executedQueries.push(`${compiled.sql} :: ${JSON.stringify(compiled.parameters)}`);
      return [];
    });
    const fakeDb: any = {
      transaction: () => ({
        execute: async (cb: (trx: any) => Promise<any>) => cb(fakeTrx),
      }),
    };

    const result = await withTenantContext(
      '11111111-1111-1111-1111-111111111111',
      async (trx) => {
        expect(trx).toBe(fakeTrx);
        return 'ok';
      },
      fakeDb,
    );

    expect(result).toBe('ok');
    expect(executedQueries.some((q) => q.includes("set_config('app.is_superadmin', 'false', true)"))).toBe(true);
    expect(executedQueries.some((q) => q.includes("set_config('app.current_tenant_id'") && q.includes('true'))).toBe(true);
  });

  it('withSuperadminContext sets app.is_superadmin=true strictly transaction-locally and clears tenant_id', async () => {
    process.env.USE_MEMORY_DB = 'false';
    const executedQueries: string[] = [];

    const fakeTrx = createFakeExecutorDb((compiled) => {
      executedQueries.push(`${compiled.sql} :: ${JSON.stringify(compiled.parameters)}`);
      return [];
    });
    const fakeDb: any = {
      transaction: () => ({
        execute: async (cb: (trx: any) => Promise<any>) => cb(fakeTrx),
      }),
    };

    const result = await withSuperadminContext(async (trx) => {
      expect(trx).toBe(fakeTrx);
      return 'admin-ok';
    }, fakeDb);

    expect(result).toBe('admin-ok');
    expect(executedQueries.some((q) => q.includes("set_config('app.current_tenant_id', '', true)"))).toBe(true);
    expect(executedQueries.some((q) => q.includes("set_config('app.is_superadmin', 'true', true)"))).toBe(true);
  });

  it('rejects startup in production if connected as postgres, superuser (rolsuper=true), or rolbypassrls=true', async () => {
    process.env.USE_MEMORY_DB = 'false';

    const makeFakeDb = (rolname: string, rolsuper: boolean, rolbypassrls: boolean) =>
      createFakeExecutorDb(() => [{ current_user: rolname, rolsuper, rolbypassrls }]) as any;

    await expect(
      verifyRuntimeDatabaseRole(makeFakeDb('postgres', true, true), 'production'),
    ).rejects.toThrow(/privileged role/i);

    await expect(
      verifyRuntimeDatabaseRole(makeFakeDb('frose_street_user', true, false), 'production'),
    ).rejects.toThrow(/privileged role/i);

    await expect(
      verifyRuntimeDatabaseRole(makeFakeDb('bypass_role', false, true), 'production'),
    ).rejects.toThrow(/privileged role/i);

    await expect(
      verifyRuntimeDatabaseRole(makeFakeDb('app_user', false, false), 'production'),
    ).resolves.toEqual({ currentUser: 'app_user', rolsuper: false, rolbypassrls: false });
  });
});
