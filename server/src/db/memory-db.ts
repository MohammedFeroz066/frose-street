import type { Kysely } from 'kysely';
import type { Database } from './types.js';

export const memoryVendors = new Map<string, any>();
export const memoryStaff = new Map<string, any>();
export const memoryMenuItems = new Map<string, any>();
export const memoryOrders = new Map<string, any>();
export const memoryOrderItems = new Map<string, any>();
export const memorySubscriptions = new Map<string, any>();
export const memoryExpenses = new Map<string, any>();
export const memoryDailySummaries = new Map<string, any>();
export const memoryBiometrics = new Map<string, any>();
export const memoryPairingTokens = new Map<string, any>();

export function createMemoryDb(): Kysely<Database> {
  const getTableMap = (table: string): Map<string, any> => {
    switch (table) {
      case 'vendors':
        return memoryVendors;
      case 'staff':
        return memoryStaff;
      case 'menu_items':
        return memoryMenuItems;
      case 'orders':
        return memoryOrders;
      case 'order_items':
        return memoryOrderItems;
      case 'subscriptions':
        return memorySubscriptions;
      case 'expenses':
        return memoryExpenses;
      case 'daily_summaries':
        return memoryDailySummaries;
      case 'biometric_credentials':
        return memoryBiometrics;
      case 'device_pairing_tokens':
        return memoryPairingTokens;
      default:
        return memoryOrders;
    }
  };

  return {
    selectFrom: (table: string) => {
      let whereConditions: { col: string; op: string; val: any }[] = [];
      let limitVal: number | undefined;
      let orderCol: string | undefined;
      let orderDir: string | undefined;

      const chain = {
        select: (_cols?: any) => chain,
        selectAll: () => chain,
        where: (col: string, op: string, val: any) => {
          whereConditions.push({ col, op, val });
          return chain;
        },
        orderBy: (col: string, dir: string = 'asc') => {
          orderCol = col;
          orderDir = dir;
          return chain;
        },
        limit: (n: number) => {
          limitVal = n;
          return chain;
        },
        offset: (_n: number) => chain,
        execute: async () => {
          const sourceMap = getTableMap(table);
          const matched: any[] = [];

          for (const row of sourceMap.values()) {
            let match = true;
            for (const cond of whereConditions) {
              const prop = cond.col.replace(`${table}.`, '');
              if (cond.op === '=') {
                if (row[prop] !== cond.val) match = false;
              } else if (cond.op === 'in') {
                if (Array.isArray(cond.val) && !cond.val.includes(row[prop])) match = false;
              } else if (cond.op === 'is not') {
                if (row[prop] === null || row[prop] === undefined) match = false;
              }
            }
            if (match) matched.push({ ...row });
          }

          if (orderCol) {
            matched.sort((a, b) => {
              const valA = a[orderCol!] ?? '';
              const valB = b[orderCol!] ?? '';
              if (valA < valB) return orderDir === 'desc' ? 1 : -1;
              if (valA > valB) return orderDir === 'desc' ? -1 : 1;
              return 0;
            });
          }

          if (limitVal !== undefined) {
            return matched.slice(0, limitVal);
          }
          return matched;
        },
        executeTakeFirst: async () => {
          const list = await chain.execute();
          return list[0] || null;
        },
        executeTakeFirstOrThrow: async () => {
          const list = await chain.execute();
          if (!list[0]) throw new Error(`Record not found in ${table}`);
          return list[0];
        },
      };
      return chain;
    },
    insertInto: (table: string) => {
      let insertVals: any = {};
      const chain = {
        values: (v: any) => {
          insertVals = { ...v };
          if (!insertVals.id) insertVals.id = 'uuid-' + Math.random().toString(36).substring(2, 9);
          if (!insertVals.created_at) insertVals.created_at = new Date().toISOString();
          return chain;
        },
        returningAll: () => chain,
        execute: async () => {
          const targetMap = getTableMap(table);
          targetMap.set(insertVals.id, insertVals);
          return [insertVals];
        },
        executeTakeFirstOrThrow: async () => {
          const [row] = await chain.execute();
          return row;
        },
      };
      return chain;
    },
    updateTable: (table: string) => {
      let updateVals: any = {};
      let whereConditions: { col: string; op: string; val: any }[] = [];
      const chain = {
        set: (v: any) => {
          updateVals = { ...v };
          return chain;
        },
        where: (col: string, op: string, val: any) => {
          whereConditions.push({ col, op, val });
          return chain;
        },
        returningAll: () => chain,
        execute: async () => {
          const targetMap = getTableMap(table);
          let updatedCount = 0n;

          for (const [id, row] of targetMap.entries()) {
            let match = true;
            for (const cond of whereConditions) {
              const prop = cond.col.replace(`${table}.`, '');
              if (cond.op === '=') {
                if (row[prop] !== cond.val) match = false;
              }
            }
            if (match) {
              targetMap.set(id, { ...row, ...updateVals });
              updatedCount++;
            }
          }
          return [{ numUpdatedRows: updatedCount }];
        },
        executeTakeFirstOrThrow: async () => {
          const rows = await chain.execute();
          return rows[0];
        },
      };
      return chain;
    },
    deleteFrom: (table: string) => {
      let whereConditions: { col: string; op: string; val: any }[] = [];
      const chain = {
        where: (col: string, op: string, val: any) => {
          whereConditions.push({ col, op, val });
          return chain;
        },
        execute: async () => {
          const targetMap = getTableMap(table);
          let deletedCount = 0n;

          for (const [id, row] of Array.from(targetMap.entries())) {
            let match = true;
            for (const cond of whereConditions) {
              const prop = cond.col.replace(`${table}.`, '');
              if (cond.op === '=') {
                if (row[prop] !== cond.val) match = false;
              }
            }
            if (match) {
              targetMap.delete(id);
              deletedCount++;
            }
          }
          return [{ numDeletedRows: deletedCount }];
        },
      };
      return chain;
    },
  } as unknown as Kysely<Database>;
}
