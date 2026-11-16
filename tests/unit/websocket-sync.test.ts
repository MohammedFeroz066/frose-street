import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { WebSocketHub, WebSocketLike, ConnectedClient } from '../../server/src/modules/websocket/websocket.hub.js';
import { OrderService } from '../../server/src/modules/orders/order.service.js';
import { MenuService } from '../../server/src/modules/menu/menu.service.js';
import { signJwt } from '../../server/src/modules/auth/jwt.js';
import { buildApp } from '../../server/src/app.js';
import type { FastifyInstance } from 'fastify';

// Mock WebSocket class for fast in-memory testing
class MockWebSocket implements WebSocketLike {
  readyState = 1; // 1 = OPEN
  sentMessages: string[] = [];
  listeners: Record<string, ((...args: any[]) => void)[]> = {};

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(_code?: number, _reason?: string): void {
    this.readyState = 3; // 3 = CLOSED
    this.emit('close');
  }

  on(event: string, listener: (...args: any[]) => void): this {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(listener);
    return this;
  }

  emit(event: string, ...args: any[]): void {
    const list = this.listeners[event] || [];
    for (const fn of list) {
      fn(...args);
    }
  }

  getLastJsonMessage(): any {
    if (this.sentMessages.length === 0) return null;
    return JSON.parse(this.sentMessages[this.sentMessages.length - 1]);
  }
}

// In-memory data store for testing
const memoryVendors: Map<string, any> = new Map();
const memoryMenuItems: Map<string, any> = new Map();
const memoryOrders: Map<string, any> = new Map();
const memoryOrderItems: Map<string, any> = new Map();

// Mock getDatabase implementation
vi.mock('../../server/src/db/database.js', () => {
  const createMockDb = () => {
    return {
      selectFrom: (table: string) => {
        let whereConditions: { col: string; op: string; val: any }[] = [];

        const chain = {
          select: (_cols?: any) => chain,
          selectAll: () => chain,
          where: (col: string, op: string, val: any) => {
            whereConditions.push({ col, op, val });
            return chain;
          },
          orderBy: (_col: string, _dir?: string) => chain,
          execute: async () => {
            let sourceMap = memoryOrders;
            if (table === 'vendors') sourceMap = memoryVendors;
            if (table === 'menu_items') sourceMap = memoryMenuItems;
            if (table === 'order_items') sourceMap = memoryOrderItems;

            const matched: any[] = [];
            for (const row of sourceMap.values()) {
              let match = true;
              for (const cond of whereConditions) {
                const prop = cond.col.replace(`${table}.`, '');
                if (cond.op === '=') {
                  if (row[prop] !== cond.val) match = false;
                } else if (cond.op === 'in') {
                  if (!cond.val.includes(row[prop])) match = false;
                }
              }
              if (match) matched.push({ ...row });
            }
            return matched;
          },
          executeTakeFirst: async () => {
            const list = await chain.execute();
            return list.length > 0 ? list[0] : undefined;
          },
          executeTakeFirstOrThrow: async () => {
            const list = await chain.execute();
            if (list.length === 0) throw new Error('Not found');
            return list[0];
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
                  const id = vals.id || `mock-${table}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                  const record = { ...vals, id, created_at: new Date(), updated_at: new Date() };

                  if (table === 'orders') memoryOrders.set(id, record);
                  if (table === 'order_items') memoryOrderItems.set(id, record);
                  if (table === 'vendors') memoryVendors.set(id, record);
                  if (table === 'menu_items') memoryMenuItems.set(id, record);

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
            let conditions: { col: string; val: any }[] = [];

            const updateChain: any = {
              where: (col: string, _op: string, val: any) => {
                conditions.push({ col, val });
                return updateChain;
              },
              execute: async () => {
                let sourceMap = memoryOrders;
                if (table === 'vendors') sourceMap = memoryVendors;
                if (table === 'menu_items') sourceMap = memoryMenuItems;

                for (const [id, row] of sourceMap.entries()) {
                  let match = true;
                  for (const cond of conditions) {
                    if (row[cond.col] !== cond.val && id !== cond.val) {
                      match = false;
                    }
                  }
                  if (match) {
                    sourceMap.set(id, { ...row, ...updates });
                  }
                }
              },
            };

            return updateChain;
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

describe('Phase 9 Acceptance: WebSocket Real-Time Synchronization Engine', () => {
  const JWT_SECRET = 'frose-street-default-dev-secret-key-32chars';
  let app: FastifyInstance;
  const vendorStall1 = 'vendor-stall-realtime-1';
  const vendorStall2 = 'vendor-stall-realtime-2';
  let stall1OwnerToken = '';

  beforeAll(async () => {
    stall1OwnerToken = signJwt(
      {
        sub: vendorStall1,
        phone: '9876543210',
        businessName: 'Royal Momos Corner',
        role: 'owner',
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
    WebSocketHub._reset();
    memoryOrders.clear();
    memoryOrderItems.clear();
    memoryMenuItems.clear();
    memoryVendors.clear();

    const todayDate = new Date().toISOString().split('T')[0];

    memoryVendors.set(vendorStall1, {
      id: vendorStall1,
      phone: '9876543210',
      business_name: 'Royal Momos Corner',
      daily_token_counter: 0,
      token_reset_date: todayDate,
    });

    memoryMenuItems.set('dish-1', {
      id: 'dish-1',
      vendor_id: vendorStall1,
      name: 'Paneer Steamed Momos',
      price_paise: BigInt(7000),
      is_available: true,
      is_active: true,
    });
  });

  describe('TEST 1: WebSocketHub Client Registration & Stall Isolation', () => {
    it('registers client socket and sends connection established event', () => {
      const mockSocket = new MockWebSocket();
      const client: ConnectedClient = {
        socket: mockSocket,
        vendorId: vendorStall1,
        role: 'cook',
        deviceId: 'dev-kitchen-1',
        connectedAt: new Date(),
        lastPing: Date.now(),
      };

      WebSocketHub.registerClient(client);

      const stats = WebSocketHub.getStats(vendorStall1);
      expect(stats.stallClients).toBe(1);
      expect(stats.totalClients).toBe(1);

      // Verify connection message was sent
      const welcome = mockSocket.getLastJsonMessage();
      expect(welcome.event).toBe('connected');
      expect(welcome.data.role).toBe('cook');
      expect(welcome.data.vendorId).toBe(vendorStall1);
    });

    it('multi-stall isolation: broadcasts to Stall 1 are never received by Stall 2', () => {
      const socketStall1 = new MockWebSocket();
      const socketStall2 = new MockWebSocket();

      WebSocketHub.registerClient({
        socket: socketStall1,
        vendorId: vendorStall1,
        role: 'cook',
        connectedAt: new Date(),
        lastPing: Date.now(),
      });

      WebSocketHub.registerClient({
        socket: socketStall2,
        vendorId: vendorStall2,
        role: 'cook',
        connectedAt: new Date(),
        lastPing: Date.now(),
      });

      // Broadcast event strictly to Stall 1
      const count = WebSocketHub.broadcast(vendorStall1, 'order:new', { tokenNo: 15 });
      expect(count).toBe(1);

      // Stall 1 must receive the event
      const stall1Msg = socketStall1.getLastJsonMessage();
      expect(stall1Msg.event).toBe('order:new');
      expect(stall1Msg.data.tokenNo).toBe(15);

      // Stall 2 must NOT receive the event (sentMessages length is only 1 from welcome)
      expect(socketStall2.sentMessages.length).toBe(1);
      expect(socketStall2.getLastJsonMessage().event).toBe('connected');
    });

    it('role-based filtering: restricts broadcast delivery to target roles only', () => {
      const cookSocket = new MockWebSocket();
      const cashierSocket = new MockWebSocket();

      WebSocketHub.registerClient({
        socket: cookSocket,
        vendorId: vendorStall1,
        role: 'cook',
        connectedAt: new Date(),
        lastPing: Date.now(),
      });

      WebSocketHub.registerClient({
        socket: cashierSocket,
        vendorId: vendorStall1,
        role: 'cashier',
        connectedAt: new Date(),
        lastPing: Date.now(),
      });

      // Broadcast exclusively to cooks
      const count = WebSocketHub.broadcast(vendorStall1, 'kitchen:rush_alert', { msg: 'Rush hour!' }, ['cook']);
      expect(count).toBe(1);

      expect(cookSocket.getLastJsonMessage().event).toBe('kitchen:rush_alert');
      expect(cashierSocket.getLastJsonMessage().event).toBe('connected');
    });
  });

  describe('TEST 2: Disconnection & Teardown Handling', () => {
    it('socket close event cleans up client from registry', () => {
      const socket = new MockWebSocket();
      const client: ConnectedClient = {
        socket,
        vendorId: vendorStall1,
        role: 'cook',
        connectedAt: new Date(),
        lastPing: Date.now(),
      };

      WebSocketHub.registerClient(client);
      expect(WebSocketHub.getStats(vendorStall1).stallClients).toBe(1);

      // Simulate client closing the browser / turning off tablet
      socket.close();

      expect(WebSocketHub.getStats(vendorStall1).stallClients).toBe(0);
      expect(WebSocketHub.getStats().totalStalls).toBe(0);
    });
  });

  describe('TEST 3: Real-Time Event Integration with Services', () => {
    it('OrderService.createOrder automatically broadcasts order:new in real time', async () => {
      const kitchenDisplay = new MockWebSocket();
      WebSocketHub.registerClient({
        socket: kitchenDisplay,
        vendorId: vendorStall1,
        role: 'cook',
        connectedAt: new Date(),
        lastPing: Date.now(),
      });

      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();

      // Punch order
      const order = await OrderService.createOrder(db, vendorStall1, {
        items: [{ menuItemId: 'dish-1', quantity: 2 }],
        paymentMethod: 'cash',
      });

      // Kitchen display must receive order:new immediately
      const msg = kitchenDisplay.getLastJsonMessage();
      expect(msg.event).toBe('order:new');
      expect(msg.data.tokenNo).toBe(order.tokenNo);
      expect(msg.data.totalPaise).toBe(14000);
      expect(msg.data.items.length).toBe(1);
    });

    it('OrderService.updateOrderStatus automatically broadcasts order:status_changed', async () => {
      const packagingDisplay = new MockWebSocket();
      WebSocketHub.registerClient({
        socket: packagingDisplay,
        vendorId: vendorStall1,
        role: 'packer',
        connectedAt: new Date(),
        lastPing: Date.now(),
      });

      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();

      const order = await OrderService.createOrder(db, vendorStall1, {
        items: [{ menuItemId: 'dish-1', quantity: 1 }],
        paymentMethod: 'upi',
      });

      // Cook marks ready
      await OrderService.updateOrderStatus(db, vendorStall1, order.id, 'ready', 'cook');

      // Packaging lane receives order:status_changed in sub-500ms
      const msg = packagingDisplay.getLastJsonMessage();
      expect(msg.event).toBe('order:status_changed');
      expect(msg.data.tokenNo).toBe(order.tokenNo);
      expect(msg.data.newStatus).toBe('ready');
    });

    it('MenuService.toggleAvailability automatically broadcasts menu:availability_changed', async () => {
      const cashierScreen = new MockWebSocket();
      WebSocketHub.registerClient({
        socket: cashierScreen,
        vendorId: vendorStall1,
        role: 'cashier',
        connectedAt: new Date(),
        lastPing: Date.now(),
      });

      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();

      // Cook toggles out of stock
      await MenuService.toggleAvailability(db, vendorStall1, 'dish-1');

      const msg = cashierScreen.getLastJsonMessage();
      expect(msg.event).toBe('menu:availability_changed');
      expect(msg.data.id).toBe('dish-1');
      expect(msg.data.isAvailable).toBe(false);
      expect(msg.data.statusText).toBe('Out of Stock');
    });
  });

  describe('TEST 4: WebSocket HTTP Stats Endpoint', () => {
    it('GET /api/v1/ws/stats returns active screen counts for authenticated stall', async () => {
      const cookSocket = new MockWebSocket();
      const packerSocket = new MockWebSocket();

      WebSocketHub.registerClient({
        socket: cookSocket,
        vendorId: vendorStall1,
        role: 'cook',
        connectedAt: new Date(),
        lastPing: Date.now(),
      });

      WebSocketHub.registerClient({
        socket: packerSocket,
        vendorId: vendorStall1,
        role: 'packer',
        connectedAt: new Date(),
        lastPing: Date.now(),
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ws/stats',
        headers: {
          authorization: `Bearer ${stall1OwnerToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.vendorId).toBe(vendorStall1);
      expect(json.activeScreens).toBe(2);
    });
  });
});
