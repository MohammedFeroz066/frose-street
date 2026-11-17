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

export const DEFAULT_DEMO_VENDOR_ID = 'v-stall-demo-01';

// Seed initial default demo vendor so out-of-the-box mobile devices work immediately
if (!memoryVendors.has(DEFAULT_DEMO_VENDOR_ID)) {
  memoryVendors.set(DEFAULT_DEMO_VENDOR_ID, {
    id: DEFAULT_DEMO_VENDOR_ID,
    phone: '9876543210',
    business_name: 'Tibetan Momo Point',
    owner_name: 'Stall Master',
    business_type: 'Street Food Stall',
    city: 'Mumbai',
    edition: 'cloud',
    subscription_status: 'active',
    subscription_expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    quick_pin_hash: 'default',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const defaultDishes = [
    { id: 'def-1', name: 'Veg Steamed Momos', price_paise: 6000, category: 'Momos', emoji_icon: '🥟', color_hex: '#10b981' },
    { id: 'def-2', name: 'Chicken Steamed Momos', price_paise: 8000, category: 'Momos', emoji_icon: '🥟', color_hex: '#ef4444' },
    { id: 'def-3', name: 'Veg Fried Momos', price_paise: 7000, category: 'Momos', emoji_icon: '🥟', color_hex: '#f59e0b' },
    { id: 'def-4', name: 'Chicken Fried Momos', price_paise: 9000, category: 'Momos', emoji_icon: '🥟', color_hex: '#dc2626' },
    { id: 'def-5', name: 'Veg Hakka Noodles', price_paise: 8000, category: 'Chinese', emoji_icon: '🍜', color_hex: '#059669' },
    { id: 'def-6', name: 'Chicken Hakka Noodles', price_paise: 11000, category: 'Chinese', emoji_icon: '🍜', color_hex: '#ea580c' },
    { id: 'def-7', name: 'Special Masala Chai', price_paise: 1500, category: 'Beverages', emoji_icon: '☕', color_hex: '#d97706' },
    { id: 'def-8', name: 'Chilled Thums Up 250ml', price_paise: 2000, category: 'Beverages', emoji_icon: '🥤', color_hex: '#2563eb' },
  ];

  for (const d of defaultDishes) {
    memoryMenuItems.set(d.id, {
      ...d,
      vendor_id: DEFAULT_DEMO_VENDOR_ID,
      is_available: true,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
}

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
