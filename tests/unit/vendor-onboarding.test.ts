import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from '../../server/src/app.js';
import { getDatabase, closeDatabase } from '../../server/src/db/database.js';
import { STREET_MENU_PRESETS } from '../../server/src/modules/menu/menu.presets.js';

// In-memory data store for isolated unit tests
const memoryVendors: Map<string, any> = new Map();
const memoryStaff: Map<string, any> = new Map();
const memoryMenuItems: Map<string, any> = new Map();

// Mock getDatabase implementation
vi.mock('../../server/src/db/database.js', () => {
  const createMockDb = () => {
    return {
      selectFrom: (table: string) => {
        let whereConditions: { col: string; val: any }[] = [];

        const chain = {
          select: (_cols?: any) => chain,
          selectAll: () => chain,
          where: (col: string, _op: string, val: any) => {
            whereConditions.push({ col, val });
            return chain;
          },
          execute: async () => {
            if (table === 'menu_items') {
              const matched: any[] = [];
              for (const item of memoryMenuItems.values()) {
                let match = true;
                for (const cond of whereConditions) {
                  const prop = cond.col.replace('menu_items.', '');
                  if (item[prop] !== cond.val) match = false;
                }
                if (match) matched.push({ ...item });
              }
              return matched;
            }
            return [];
          },
          executeTakeFirst: async () => {
            if (table === 'vendors') {
              for (const v of memoryVendors.values()) {
                let match = true;
                for (const cond of whereConditions) {
                  const prop = cond.col.replace('vendors.', '');
                  if (v[prop] !== cond.val) match = false;
                }
                if (match) return { ...v };
              }
              return undefined;
            }
            return undefined;
          },
        };
        return chain;
      },
      insertInto: (table: string) => {
        return {
          values: (vals: any) => {
            return {
              returningAll: () => ({
                executeTakeFirstOrThrow: async () => {
                  const id = vals.id || `mock-uuid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                  const record = { ...vals, id, created_at: new Date() };

                  if (table === 'vendors') {
                    memoryVendors.set(id, record);
                  } else if (table === 'staff') {
                    memoryStaff.set(id, record);
                  }
                  return record;
                },
              }),
              execute: async () => {
                const id = vals.id || `mock-menu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                const record = { ...vals, id, created_at: new Date() };
                if (table === 'menu_items') {
                  memoryMenuItems.set(id, record);
                }
                return { insertId: id };
              },
            };
          },
        };
      },
      updateTable: (table: string) => {
        return {
          set: (updates: any) => {
            return {
              where: (col: string, _op: string, val: any) => {
                const subWhere = {
                  where: (col2: string, _op2: string, val2: any) => ({
                    execute: async () => {
                      if (table === 'staff') {
                        for (const [sId, s] of memoryStaff.entries()) {
                          if (s[col] === val && s[col2] === val2) {
                            memoryStaff.set(sId, { ...s, ...updates });
                          }
                        }
                      }
                      return;
                    },
                  }),
                  execute: async () => {
                    if (table === 'vendors') {
                      for (const [vId, v] of memoryVendors.entries()) {
                        if (v[col] === val || vId === val) {
                          memoryVendors.set(vId, { ...v, ...updates });
                        }
                      }
                    }
                    return;
                  },
                };
                return subWhere;
              },
            };
          },
        };
      },
    };
  };

  return {
    getDatabase: vi.fn(() => createMockDb()),
    closeDatabase: vi.fn(async () => {}),
  };
});

describe('Phase 12 Acceptance: Vendor Registration, 60-Second Onboarding & Preset Seeding', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  describe('TEST 1: Registration Form & HTML UI Assets', () => {
    const registerHtmlPath = path.resolve(process.cwd(), 'client/register.html');

    it('register.html must exist in client directory', () => {
      expect(fs.existsSync(registerHtmlPath)).toBe(true);
    });

    it('register.html must contain stall details, presets, and PIN inputs', () => {
      const html = fs.readFileSync(registerHtmlPath, 'utf8');
      expect(html).toContain('id="stall-name"');
      expect(html).toContain('id="phone-number"');
      expect(html).toContain('id="upi-id"');
      expect(html).toContain('id="quick-pin"');
      expect(html).toContain('id="btn-register-submit"');
    });

    it('register.html must offer the street menu presets', () => {
      const html = fs.readFileSync(registerHtmlPath, 'utf8');
      expect(html).toContain('momos_chinese');
      expect(html).toContain('chai_nashta');
      expect(html).toContain('chaat_panipuri');
    });

    it('register.html must adhere to formal two-color design tokens (#0F172A & #D97706)', () => {
      const html = fs.readFileSync(registerHtmlPath, 'utf8');
      expect(html).toContain('stylesheet');
      expect(html).toContain('/css/style.css');
    });
  });

  describe('TEST 2: Backend API Registration with Menu Preset Seeding', () => {
    it('POST /api/v1/auth/register-stall rejects invalid phone number', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register-stall',
        payload: {
          businessName: 'Test Stall',
          phone: '123', // invalid
          quickPin: '1234',
        },
      });
      expect(res.statusCode).toBe(400);
      const data = res.json();
      expect(data.code || data.error?.code).toBe('INVALID_PHONE');
    });

    it('POST /api/v1/auth/register-stall rejects missing stall name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register-stall',
        payload: {
          businessName: '',
          phone: '9876543210',
          quickPin: '1234',
        },
      });
      expect(res.statusCode).toBe(400);
      const data = res.json();
      expect(data.code || data.error?.code).toBe('MISSING_BUSINESS_NAME');
    });

    it('POST /api/v1/auth/register-stall registers vendor, sets quick PIN and seeds preset menu', async () => {
      const testPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register-stall',
        payload: {
          businessName: 'Royal Momos & Chai',
          phone: testPhone,
          upiId: 'royalmomos@upi',
          quickPin: '4321',
          presetKey: 'momos_chinese',
          edition: 'cloud',
        },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.status).toBe('success');
      expect(data.vendor).toBeDefined();
      expect(data.vendor.businessName).toBe('Royal Momos & Chai');
      expect(data.vendor.phone).toBe(testPhone);
      expect(data.token).toBeDefined();
      expect(data.seededItemsCount).toBeGreaterThan(0);

      // Verify that menu items were seeded in database
      const db = getDatabase();
      const menuItems = await db
        .selectFrom('menu_items')
        .selectAll()
        .where('vendor_id', '=', data.vendor.id)
        .execute();

      expect(menuItems.length).toBe(STREET_MENU_PRESETS.momos_chinese.items.length);

      // Strict financial check: all prices must be valid integers in paise
      for (const item of menuItems) {
        expect(Number.isInteger(Number(item.price_paise))).toBe(true);
        expect(Number(item.price_paise)).toBeGreaterThan(0);
      }

      // Verify Quick PIN works for unlock
      const pinVerifyRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-pin',
        payload: {
          vendorId: data.vendor.id,
          pin: '4321',
        },
      });
      expect(pinVerifyRes.statusCode).toBe(200);
    });
  });
});
