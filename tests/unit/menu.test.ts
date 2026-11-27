import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MenuService } from '../../server/src/modules/menu/menu.service.js';
import { STREET_MENU_PRESETS } from '../../server/src/modules/menu/menu.presets.js';
import { signJwt } from '../../server/src/modules/auth/jwt.js';
import { buildApp } from '../../server/src/app.js';
import type { FastifyInstance } from 'fastify';

// In-memory data store for testing
const memoryMenuItems: Map<string, any> = new Map();

// Mock getDatabase implementation
vi.mock('../../server/src/db/database.js', () => {
  const createMockDb = () => {
    return {
      selectFrom: (table: string) => {
        let whereConditions: { col: string; val: any }[] = [];
        let sortCol = 'created_at';
        let sortDir = 'asc';

        const chain = {
          select: (_cols?: any) => chain,
          selectAll: () => chain,
          where: (col: string, _op: string, val: any) => {
            whereConditions.push({ col, val });
            return chain;
          },
          orderBy: (col: string, dir: string = 'asc') => {
            sortCol = col;
            sortDir = dir;
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
              matched.sort((a, b) => {
                if (sortCol === 'display_order') {
                  return sortDir === 'desc' ? b.display_order - a.display_order : a.display_order - b.display_order;
                }
                return 0;
              });
              return matched;
            }
            return [];
          },
          executeTakeFirst: async () => {
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
              if (matched.length === 0) return undefined;
              if (sortCol === 'display_order') {
                matched.sort((a, b) => (sortDir === 'desc' ? b.display_order - a.display_order : a.display_order - b.display_order));
              }
              return matched[0];
            }
            return undefined;
          },
          executeTakeFirstOrThrow: async () => {
            const first = await chain.executeTakeFirst();
            if (!first) throw new Error('Not found');
            return first;
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
                  const id = vals.id || `mock-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                  const record = { ...vals, id, created_at: new Date() };
                  if (table === 'menu_items') {
                    memoryMenuItems.set(id, record);
                  }
                  return record;
                },
              }),
            };
          },
        };
      },
      updateTable: (table: string) => {
        return {
          set: (updates: any) => {
            return {
              where: (col1: string, _op1: string, val1: any) => {
                return {
                  where: (col2: string, _op2: string, val2: any) => {
                    return {
                      execute: async () => {
                        if (table === 'menu_items') {
                          for (const [id, item] of memoryMenuItems.entries()) {
                            if ((item[col1] === val1 || id === val1) && (item[col2] === val2 || id === val2)) {
                              memoryMenuItems.set(id, { ...item, ...updates });
                            }
                          }
                        }
                      },
                    };
                  },
                  execute: async () => {
                    if (table === 'menu_items') {
                      for (const [id, item] of memoryMenuItems.entries()) {
                        if (item[col1] === val1 || id === val1) {
                          memoryMenuItems.set(id, { ...item, ...updates });
                        }
                      }
                    }
                  },
                };
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

describe('Phase 7 Acceptance: Menu Management Backend', () => {
  const JWT_SECRET = 'frose-street-default-dev-secret-key-32chars';
  let app: FastifyInstance;
  const mockVendorId = 'vendor-stall-phase-7';
  let ownerToken = '';
  let cookToken = '';
  let packerToken = '';

  beforeAll(async () => {
    ownerToken = signJwt(
      {
        sub: mockVendorId,
        phone: '9876543210',
        businessName: 'Sharma Chaat & Momos',
        role: 'owner',
        edition: 'cloud',
      },
      JWT_SECRET,
    );

    cookToken = signJwt(
      {
        sub: mockVendorId,
        phone: '9876543210',
        businessName: 'Sharma Chaat & Momos',
        role: 'cook',
        edition: 'cloud',
      },
      JWT_SECRET,
    );

    packerToken = signJwt(
      {
        sub: mockVendorId,
        phone: '9876543210',
        businessName: 'Sharma Chaat & Momos',
        role: 'packer',
        edition: 'cloud',
      },
      JWT_SECRET,
    );

    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    memoryMenuItems.clear();
  });

  describe('TEST 1: Strict Integer Paise & Money Constraints', () => {
    it('rejects negative price with 400 INVALID_PRICE_PAISE', async () => {
      const mockDb: any = {};
      await expect(
        MenuService.createMenuItem(mockDb, mockVendorId, {
          name: 'Aloo Patty',
          pricePaise: -500,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_PRICE_PAISE',
      });
    });

    it('rejects zero price with 400 INVALID_PRICE_PAISE', async () => {
      const mockDb: any = {};
      await expect(
        MenuService.createMenuItem(mockDb, mockVendorId, {
          name: 'Free Water',
          pricePaise: 0,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_PRICE_PAISE',
      });
    });

    it('rejects floating-point decimals with 400 INVALID_PRICE_PAISE', async () => {
      const mockDb: any = {};
      await expect(
        MenuService.createMenuItem(mockDb, mockVendorId, {
          name: 'Tea with Float',
          pricePaise: 15.5 as any,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_PRICE_PAISE',
      });
    });

    it('rejects string price with 400 INVALID_PRICE_PAISE', async () => {
      const mockDb: any = {};
      await expect(
        MenuService.createMenuItem(mockDb, mockVendorId, {
          name: 'Bad Input Item',
          pricePaise: '1500' as any,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_PRICE_PAISE',
      });
    });

    it('successfully creates item with integer paise and returns rupee conversion', async () => {
      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();

      const item = await MenuService.createMenuItem(db, mockVendorId, {
        name: 'Veg Steamed Momos (6 pcs)',
        pricePaise: 6000,
        category: 'Momos',
        emojiIcon: '🥟',
        colorHex: '#10b981',
      });

      expect(item.id).toBeDefined();
      expect(item.name).toBe('Veg Steamed Momos (6 pcs)');
      expect(item.pricePaise).toBe(6000);
      expect(item.priceRupees).toBe(60);
      expect(item.isAvailable).toBe(true);
    });
  });

  describe('TEST 2: Tactile Touch Attributes & Display Order', () => {
    it('auto-increments display order for successive items', async () => {
      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();

      const item1 = await MenuService.createMenuItem(db, mockVendorId, {
        name: 'Cutting Chai',
        pricePaise: 1500,
      });

      const item2 = await MenuService.createMenuItem(db, mockVendorId, {
        name: 'Masala Samosa',
        pricePaise: 2000,
      });

      expect(item1.displayOrder).toBe(1);
      expect(item2.displayOrder).toBe(2);
    });

    it('preserves custom display order when explicitly provided', async () => {
      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();

      const item = await MenuService.createMenuItem(db, mockVendorId, {
        name: 'Chef Special Samosa',
        pricePaise: 3000,
        displayOrder: 99,
      });

      expect(item.displayOrder).toBe(99);
    });
  });

  describe('TEST 3: 1-Tap Availability Toggling (In-Stock / Out-of-Stock)', () => {
    it('toggles item availability from true to false and back', async () => {
      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();

      const item = await MenuService.createMenuItem(db, mockVendorId, {
        name: 'Paneer Roll',
        pricePaise: 9000,
      });

      // 1st Tap: Out of stock
      const toggle1 = await MenuService.toggleAvailability(db, mockVendorId, item.id);
      expect(toggle1.isAvailable).toBe(false);
      expect(toggle1.statusText).toBe('Out of Stock');

      // 2nd Tap: Back in stock
      const toggle2 = await MenuService.toggleAvailability(db, mockVendorId, item.id);
      expect(toggle2.isAvailable).toBe(true);
      expect(toggle2.statusText).toBe('In Stock');
    });

    it('availableOnly filter excludes out-of-stock items', async () => {
      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();

      const item1 = await MenuService.createMenuItem(db, mockVendorId, {
        name: 'Available Chai',
        pricePaise: 1500,
        isAvailable: true,
      });

      const item2 = await MenuService.createMenuItem(db, mockVendorId, {
        name: 'Finished Samosa',
        pricePaise: 2000,
        isAvailable: false,
      });

      const all = await MenuService.getMenuItems(db, mockVendorId);
      expect(all.length).toBe(2);

      const available = await MenuService.getMenuItems(db, mockVendorId, { availableOnly: true });
      expect(available.length).toBe(1);
      expect(available[0].name).toBe('Available Chai');
    });
  });

  describe('TEST 4: Street Presets Catalog & 1-Tap Seeding', () => {
    it('returns list of 6 standard Indian street food presets', () => {
      const catalog = MenuService.getPresetCatalog();
      expect(catalog.length).toBe(6);

      const momoPreset = catalog.find((p) => p.key === 'momos_chinese');
      expect(momoPreset).toBeDefined();
      expect(momoPreset?.totalItems).toBe(8);
      expect(momoPreset?.previewItems.length).toBe(3);
    });

    it('seeds all items from street preset with correct paise pricing', async () => {
      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();

      const seeded = await MenuService.seedPresets(db, mockVendorId, 'chaat_panipuri');
      expect(seeded.itemsCount).toBe(6);
      expect(seeded.presetLabel).toBe('Pani Puri & Chaat Cart');

      const allItems = await MenuService.getMenuItems(db, mockVendorId);
      expect(allItems.length).toBe(6);
      expect(allItems[0].name).toBe('Pani Puri (6 pcs)');
      expect(allItems[0].pricePaise).toBe(3000);
      expect(allItems[0].priceRupees).toBe(30);
    });

    it('rejects invalid preset category with 400', async () => {
      const mockDb: any = {};
      await expect(MenuService.seedPresets(mockDb, mockVendorId, 'unknown_preset')).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_PRESET',
      });
    });
  });

  describe('TEST 5: End-to-End Menu API Routes via app.inject()', () => {
    it('GET /api/v1/menu/presets: Returns preset catalog without auth', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/menu/presets',
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(Array.isArray(json.presets)).toBe(true);
      expect(json.presets.length).toBe(6);
    });

    it('POST /api/v1/menu/presets/seed: Cashier seeds preset items', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/menu/presets/seed',
        headers: {
          authorization: `Bearer ${ownerToken}`,
        },
        payload: {
          presetKey: 'chai_nashta',
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.itemsCount).toBe(7);
    });

    it('POST /api/v1/menu: Adds custom dish', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/menu',
        headers: {
          authorization: `Bearer ${ownerToken}`,
        },
        payload: {
          name: 'Special Malai Rabdi Kulfi',
          pricePaise: 4000,
          category: 'Desserts',
          emojiIcon: '🍦',
          colorHex: '#ec4899',
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.item.name).toBe('Special Malai Rabdi Kulfi');
      expect(json.item.pricePaise).toBe(4000);
      expect(json.item.priceRupees).toBe(40);
      expect(json.item.emojiIcon).toBe('🍦');
    });

    it('PUT /api/v1/menu/:id: Updates dish name and price', async () => {
      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();
      const item = await MenuService.createMenuItem(db, mockVendorId, {
        name: 'Original Kulfi',
        pricePaise: 4000,
      });

      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/menu/${item.id}`,
        headers: {
          authorization: `Bearer ${ownerToken}`,
        },
        payload: {
          name: 'Special Royal Malai Kulfi',
          pricePaise: 4500, // ₹45
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.item.name).toBe('Special Royal Malai Kulfi');
      expect(json.item.pricePaise).toBe(4500);
      expect(json.item.priceRupees).toBe(45);
    });

    it('PATCH /api/v1/menu/:id/toggle-available: Cook can toggle out of stock', async () => {
      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();
      const item = await MenuService.createMenuItem(db, mockVendorId, {
        name: 'Tawa Fish Fry',
        pricePaise: 12000,
      });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/menu/${item.id}/toggle-available`,
        headers: {
          authorization: `Bearer ${cookToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.isAvailable).toBe(false);
      expect(json.statusText).toBe('Out of Stock');
    });

    it('POST /api/v1/menu: Cook or Packer is forbidden from creating items', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/menu',
        headers: {
          authorization: `Bearer ${cookToken}`,
        },
        payload: {
          name: 'Unauthorized Dish',
          pricePaise: 5000,
        },
      });

      expect(res.statusCode).toBe(403);
      const json = JSON.parse(res.body);
      expect(json.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('DELETE /api/v1/menu/:id: Cashier soft-deletes item', async () => {
      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();
      const item = await MenuService.createMenuItem(db, mockVendorId, {
        name: 'Seasonal Dish To Delete',
        pricePaise: 5000,
      });

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/menu/${item.id}`,
        headers: {
          authorization: `Bearer ${ownerToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.message).toContain('removed from menu');
    });

    it('GET /api/v1/menu: Returns stall items without deleted item', async () => {
      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();
      const activeItem = await MenuService.createMenuItem(db, mockVendorId, {
        name: 'Keep Item',
        pricePaise: 3000,
      });
      const deletedItem = await MenuService.createMenuItem(db, mockVendorId, {
        name: 'Drop Item',
        pricePaise: 3000,
      });
      await MenuService.deleteMenuItem(db, mockVendorId, deletedItem.id);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/menu',
        headers: {
          authorization: `Bearer ${ownerToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.items.length).toBe(1);
      expect(json.items[0].id).toBe(activeItem.id);
    });

    it('GET /api/v1/menu: Rejects unauthenticated request with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/menu',
      });

      expect(res.statusCode).toBe(401);
      const json = JSON.parse(res.body);
      expect(json.code).toBe('AUTH_REQUIRED');
    });

    it('POS-UX-01: Accepts valid compressed data:image/jpeg and data:image/webp base64 URLs and empty string', async () => {
      const jpegDataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAA==';
      const webpDataUri = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';

      const res1 = await app.inject({
        method: 'POST',
        url: '/api/v1/menu',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          name: 'Photo Momo',
          pricePaise: 6000,
          category: 'Momos',
          imageUrl: jpegDataUri,
        },
      });
      expect(res1.statusCode).toBe(201);
      expect(JSON.parse(res1.body).item.imageUrl).toBe(jpegDataUri);

      const res2 = await app.inject({
        method: 'PUT',
        url: `/api/v1/menu/${JSON.parse(res1.body).item.id}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { imageUrl: webpDataUri },
      });
      expect(res2.statusCode).toBe(200);
      expect(JSON.parse(res2.body).item.imageUrl).toBe(webpDataUri);

      const res3 = await app.inject({
        method: 'POST',
        url: '/api/v1/menu',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          name: 'No Photo Dosa',
          pricePaise: 5000,
          category: 'South Indian',
          imageUrl: '',
        },
      });
      expect(res3.statusCode).toBe(201);
      expect(JSON.parse(res3.body).item.imageUrl).toBeNull();
    });

    it('POS-UX-01: Rejects unsafe imageUrl schemes (svg+xml, text/html, javascript:) and oversized payloads with 400', async () => {
      const badUrls = [
        'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+',
        'data:image/svg+xml,<svg onload=alert(1)>',
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        'javascript:alert(1)',
        'http://insecure.example.com/food.jpg',
        '//evil.example.com/food.jpg',
        `data:image/jpeg;base64,${'A'.repeat(180005)}`,
      ];

      for (const badUrl of badUrls) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/menu',
          headers: { authorization: `Bearer ${ownerToken}` },
          payload: {
            name: 'Bad Photo Dish',
            pricePaise: 5000,
            imageUrl: badUrl,
          },
        });
        expect(res.statusCode).toBe(400);
      }
    });
  });
});
