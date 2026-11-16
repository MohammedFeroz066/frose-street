import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { GallaService } from '../../server/src/modules/galla/galla.service.js';
import { signJwt } from '../../server/src/modules/auth/jwt.js';
import { buildApp } from '../../server/src/app.js';
import { WebSocketHub } from '../../server/src/modules/websocket/websocket.hub.js';
import type { FastifyInstance } from 'fastify';

// In-memory data store for isolated unit tests
const memoryVendors: Map<string, any> = new Map();
const memoryOrders: Map<string, any> = new Map();
const memoryOrderItems: Map<string, any> = new Map();
const memoryExpenses: Map<string, any> = new Map();
const memoryDailySummaries: Map<string, any> = new Map();

// Mock getDatabase implementation
vi.mock('../../server/src/db/database.js', () => {
  const createMockDb = () => {
    return {
      selectFrom: (table: string) => {
        let whereConditions: { col: string; op: string; val: any }[] = [];
        let limitVal: number | undefined;
        let offsetVal: number | undefined;

        const chain = {
          select: (_cols?: any) => chain,
          selectAll: () => chain,
          where: (col: string, op: string, val: any) => {
            whereConditions.push({ col, op, val });
            return chain;
          },
          orderBy: (_col: string, _dir?: string) => chain,
          limit: (n: number) => {
            limitVal = n;
            return chain;
          },
          offset: (n: number) => {
            offsetVal = n;
            return chain;
          },
          execute: async () => {
            let sourceMap = memoryExpenses;
            if (table === 'vendors') sourceMap = memoryVendors;
            if (table === 'orders') sourceMap = memoryOrders;
            if (table === 'order_items') sourceMap = memoryOrderItems;
            if (table === 'daily_summaries') sourceMap = memoryDailySummaries;

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

            let result = matched;
            if (offsetVal) result = result.slice(offsetVal);
            if (limitVal) result = result.slice(0, limitVal);
            return result;
          },
          executeTakeFirst: async () => {
            const list = await chain.execute();
            return list[0];
          },
        };
        return chain;
      },

      insertInto: (table: string) => {
        return {
          values: (rowValues: any) => {
            return {
              returningAll: () => ({
                executeTakeFirstOrThrow: async () => {
                  const id = rowValues.id || `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                  const record = {
                    id,
                    ...rowValues,
                    created_at: rowValues.created_at || new Date().toISOString(),
                  };

                  if (table === 'expenses') memoryExpenses.set(id, record);
                  if (table === 'daily_summaries') memoryDailySummaries.set(id, record);
                  if (table === 'orders') memoryOrders.set(id, record);
                  if (table === 'order_items') memoryOrderItems.set(id, record);

                  return { ...record };
                },
              }),
            };
          },
        };
      },

      updateTable: (table: string) => {
        let updates: any = {};
        const whereConds: { col: string; op: string; val: any }[] = [];

        const chain = {
          set: (vals: any) => {
            updates = vals;
            return chain;
          },
          where: (col: string, op: string, val: any) => {
            whereConds.push({ col, op, val });
            return chain;
          },
          returningAll: () => ({
            executeTakeFirstOrThrow: async () => {
              let sourceMap = memoryDailySummaries;
              if (table === 'expenses') sourceMap = memoryExpenses;

              for (const [id, row] of sourceMap.entries()) {
                let match = true;
                for (const cond of whereConds) {
                  const prop = cond.col.replace(`${table}.`, '');
                  if (cond.op === '=' && row[prop] !== cond.val) match = false;
                }
                if (match) {
                  const updated = { ...row, ...updates };
                  sourceMap.set(id, updated);
                  return updated;
                }
              }
              throw new Error('Record not found for update');
            },
          }),
          execute: async () => {
            let sourceMap = memoryDailySummaries;
            if (table === 'expenses') sourceMap = memoryExpenses;

            for (const [id, row] of sourceMap.entries()) {
              let match = true;
              for (const cond of whereConds) {
                const prop = cond.col.replace(`${table}.`, '');
                if (cond.op === '=' && row[prop] !== cond.val) match = false;
              }
              if (match) {
                sourceMap.set(id, { ...row, ...updates });
              }
            }
          },
        };
        return chain;
      },

      deleteFrom: (table: string) => {
        let whereConds: { col: string; op: string; val: any }[] = [];
        const chain = {
          where: (col: string, op: string, val: any) => {
            whereConds.push({ col, op, val });
            return chain;
          },
          execute: async () => {
            let sourceMap = memoryExpenses;
            for (const [id, row] of Array.from(sourceMap.entries())) {
              let match = true;
              for (const cond of whereConds) {
                const prop = cond.col.replace(`${table}.`, '');
                if (cond.op === '=' && row[prop] !== cond.val) match = false;
              }
              if (match) {
                sourceMap.delete(id);
              }
            }
          },
        };
        return chain;
      },
    } as any;
  };

  return {
    getDatabase: () => createMockDb(),
  };
});

describe('Phase 10 Acceptance: Daily Galla, Expenses, and Day-End Z-Report', () => {
  let app: FastifyInstance;
  const vendorId = 'v-stall-galla-01';
  let ownerToken: string;
  let cashierToken: string;
  let cookToken: string;
  let packerToken: string;

  const JWT_SECRET = 'frose-street-default-dev-secret-key-32chars';

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    // Setup Auth Tokens
    ownerToken = signJwt(
      { sub: vendorId, phone: '9876543210', role: 'owner', businessName: 'Tibetan Momo & Chai Point', edition: 'cloud' },
      JWT_SECRET,
    );
    cashierToken = signJwt(
      { sub: vendorId, phone: '9876543211', role: 'cashier', businessName: 'Tibetan Momo & Chai Point', edition: 'cloud' },
      JWT_SECRET,
    );
    cookToken = signJwt(
      { sub: vendorId, phone: '9876543212', role: 'cook', businessName: 'Tibetan Momo & Chai Point', edition: 'cloud' },
      JWT_SECRET,
    );
    packerToken = signJwt(
      { sub: vendorId, phone: '9876543213', role: 'packer', businessName: 'Tibetan Momo & Chai Point', edition: 'cloud' },
      JWT_SECRET,
    );
  });

  beforeEach(() => {
    memoryVendors.clear();
    memoryOrders.clear();
    memoryOrderItems.clear();
    memoryExpenses.clear();
    memoryDailySummaries.clear();

    memoryVendors.set(vendorId, {
      id: vendorId,
      phone: '9876543210',
      business_name: 'Tibetan Momo & Chai Point',
      owner_name: 'Tenzing Norgay',
      business_type: 'momo_cart',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('TEST 1: Strict Integer Paise Validation for Expenses', () => {
    it('must strictly reject floating-point amounts (e.g. 45.50) with FLOATS_FORBIDDEN', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/galla/expenses',
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: {
          amountPaise: 45.5,
          description: 'Milk 1L packet',
        },
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.code).toBe('FLOATS_FORBIDDEN');
    });

    it('must reject zero or negative amounts with INVALID_EXPENSE_AMOUNT', async () => {
      const resZero = await app.inject({
        method: 'POST',
        url: '/api/v1/galla/expenses',
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: {
          amountPaise: 0,
          description: 'Zero expense',
        },
      });
      expect(resZero.statusCode).toBe(400);
      expect(resZero.json().code).toBe('INVALID_EXPENSE_AMOUNT');

      const resNeg = await app.inject({
        method: 'POST',
        url: '/api/v1/galla/expenses',
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: {
          amountPaise: -500,
          description: 'Negative expense',
        },
      });
      expect(resNeg.statusCode).toBe(400);
      expect(resNeg.json().code).toBe('INVALID_EXPENSE_AMOUNT');
    });

    it('must reject empty or missing description with INVALID_DESCRIPTION', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/galla/expenses',
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: {
          amountPaise: 5000,
          description: '   ',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('INVALID_DESCRIPTION');
    });

    it('must accept valid integer paise (e.g. 8000 paise = ₹80.00)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/galla/expenses',
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: {
          amountPaise: 8000,
          description: 'Amul Taaza Milk 2L',
          category: 'dairy',
        },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.status).toBe('success');
      expect(json.expense.amountPaise).toBe(8000);
      expect(json.expense.amountRupees).toBe(80);
      expect(json.expense.description).toBe('Amul Taaza Milk 2L');
      expect(json.expense.category).toBe('dairy');
      expect(json.expense.paymentMethod).toBe('cash');
    });
  });

  describe('TEST 2: Expense Creation, Categories & Listing by Date', () => {
    it('creates multiple expenses and computes total expenses correctly in paise and rupees', async () => {
      const today = new Date().toISOString().split('T')[0];

      // Cashier logs petty cash milk
      const r1 = await app.inject({
        method: 'POST',
        url: '/api/v1/galla/expenses',
        headers: { Authorization: `Bearer ${cashierToken}` },
        payload: {
          amountPaise: 8000,
          description: 'Milk 2 packets',
          category: 'dairy',
          paymentMethod: 'cash',
        },
      });
      expect(r1.statusCode).toBe(201);

      // Cashier logs charcoal fuel
      const r2 = await app.inject({
        method: 'POST',
        url: '/api/v1/galla/expenses',
        headers: { Authorization: `Bearer ${cashierToken}` },
        payload: {
          amountPaise: 30000,
          description: 'Charcoal 10kg sack',
          category: 'gas_fuel',
          paymentMethod: 'cash',
        },
      });
      expect(r2.statusCode).toBe(201);

      // Owner logs UPI online grocery purchase
      const r3 = await app.inject({
        method: 'POST',
        url: '/api/v1/galla/expenses',
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: {
          amountPaise: 45000,
          description: 'Momo wrappers 5kg (Blinkit)',
          category: 'raw_material',
          paymentMethod: 'upi',
        },
      });
      expect(r3.statusCode).toBe(201);

      // Fetch expenses for today
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/v1/galla/expenses?date=${today}`,
        headers: { Authorization: `Bearer ${cashierToken}` },
      });

      expect(listRes.statusCode).toBe(200);
      const json = listRes.json();
      expect(json.expenses.length).toBe(3);
      expect(json.totalExpensesPaise).toBe(8000 + 30000 + 45000); // 83,000 paise = ₹830
      expect(json.totalExpensesRupees).toBe(830);
    });
  });

  describe('TEST 3: Expense Deletion & Dynamic Recalculation', () => {
    it('deletes an expense record and adjusts subsequent listing totals', async () => {
      // 1. Create expense
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/galla/expenses',
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: {
          amountPaise: 12000,
          description: 'Disposable plates & bowls',
          category: 'packaging',
        },
      });
      const expenseId = createRes.json().expense.id;

      // 2. Verify it exists
      const listBefore = await app.inject({
        method: 'GET',
        url: '/api/v1/galla/expenses',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(listBefore.json().totalExpensesPaise).toBe(12000);

      // 3. Delete expense
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/galla/expenses/${expenseId}`,
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(delRes.statusCode).toBe(200);
      expect(delRes.json().message).toBe('Expense deleted successfully');

      // 4. Verify list is now empty and total is 0
      const listAfter = await app.inject({
        method: 'GET',
        url: '/api/v1/galla/expenses',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(listAfter.json().expenses.length).toBe(0);
      expect(listAfter.json().totalExpensesPaise).toBe(0);

      // 5. Deleting already deleted item returns 404
      const delAgain = await app.inject({
        method: 'DELETE',
        url: `/api/v1/galla/expenses/${expenseId}`,
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(delAgain.statusCode).toBe(404);
      expect(delAgain.json().code).toBe('EXPENSE_NOT_FOUND');
    });
  });

  describe('TEST 4: Live Galla Math — Cash vs UPI Breakdown & Drawer Balance', () => {
    it('calculates Cash vs UPI sales, petty cash drawer balance, and net profit down to the single paisa', async () => {
      const today = new Date().toISOString().split('T')[0];

      // 1. Seed paid and cancelled orders
      // Order 1: Cash, ₹160 (16000 paise) - paid
      memoryOrders.set('ord-1', {
        id: 'ord-1',
        vendor_id: vendorId,
        token_no: 1,
        total_paise: 16000n,
        payment_method: 'cash',
        payment_status: 'paid',
        order_status: 'served',
        created_at: `${today}T10:00:00.000Z`,
      });

      // Order 2: UPI, ₹240 (24000 paise) - paid
      memoryOrders.set('ord-2', {
        id: 'ord-2',
        vendor_id: vendorId,
        token_no: 2,
        total_paise: 24000n,
        payment_method: 'upi',
        payment_status: 'paid',
        order_status: 'served',
        created_at: `${today}T11:00:00.000Z`,
      });

      // Order 3: Cash, ₹100 (10000 paise) - paid
      memoryOrders.set('ord-3', {
        id: 'ord-3',
        vendor_id: vendorId,
        token_no: 3,
        total_paise: 10000n,
        payment_method: 'cash',
        payment_status: 'paid',
        order_status: 'served',
        created_at: `${today}T12:00:00.000Z`,
      });

      // Order 4: Cash, ₹50 (5000 paise) - cancelled (must not count in revenue)
      memoryOrders.set('ord-4', {
        id: 'ord-4',
        vendor_id: vendorId,
        token_no: 4,
        total_paise: 5000n,
        payment_method: 'cash',
        payment_status: 'paid',
        order_status: 'cancelled',
        created_at: `${today}T12:30:00.000Z`,
      });

      // 2. Seed expenses
      // Expense 1: Cash petty cash from Galla drawer ₹80 (8000 paise)
      memoryExpenses.set('exp-1', {
        id: 'exp-1',
        vendor_id: vendorId,
        amount_paise: 8000n,
        description: 'Milk 2L',
        category: 'dairy',
        payment_method: 'cash',
        expense_date: today,
        created_at: `${today}T10:30:00.000Z`,
      });

      // Expense 2: UPI online expense ₹100 (10000 paise)
      memoryExpenses.set('exp-2', {
        id: 'exp-2',
        vendor_id: vendorId,
        amount_paise: 10000n,
        description: 'Cooking oil 1 can',
        category: 'raw_material',
        payment_method: 'upi',
        expense_date: today,
        created_at: `${today}T11:30:00.000Z`,
      });

      // 3. Query Live Galla Summary
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/galla/summary?date=${today}`,
        headers: { Authorization: `Bearer ${cashierToken}` },
      });

      expect(res.statusCode).toBe(200);
      const { summary } = res.json();

      // Total orders = 3 (excluding cancelled)
      expect(summary.totalOrders).toBe(3);
      expect(summary.cancelledOrders).toBe(1);

      // Total sales = 16000 + 24000 + 10000 = 50000 paise (₹500.00)
      expect(summary.totalSalesPaise).toBe(50000);
      expect(summary.totalSalesRupees).toBe(500);

      // Cash sales = 16000 + 10000 = 26000 paise (₹260.00)
      expect(summary.cashSalesPaise).toBe(26000);
      expect(summary.cashSalesRupees).toBe(260);

      // UPI sales = 24000 paise (₹240.00)
      expect(summary.upiSalesPaise).toBe(24000);
      expect(summary.upiSalesRupees).toBe(240);

      // Expenses: 8000 (cash) + 10000 (upi) = 18000 paise (₹180.00)
      expect(summary.totalExpensesPaise).toBe(18000);
      expect(summary.totalExpensesRupees).toBe(180);
      expect(summary.cashExpensesPaise).toBe(8000);
      expect(summary.upiExpensesPaise).toBe(10000);

      // Physical Cash in Galla Drawer:
      // Cash collected (₹260) - Cash spent (₹80) = ₹180 (18000 paise)
      expect(summary.cashInDrawerPaise).toBe(18000);
      expect(summary.cashInDrawerRupees).toBe(180);

      // Net Day Profit:
      // Total Sales (₹500) - Total Expenses (₹180) = ₹320 (32000 paise)
      expect(summary.netProfitPaise).toBe(32000);
      expect(summary.netProfitRupees).toBe(320);

      // Day not closed yet
      expect(summary.isDayClosed).toBe(false);
    });
  });

  describe('TEST 5: Top Selling Item Identification', () => {
    it('accurately identifies the highest selling menu item for the day', async () => {
      const today = new Date().toISOString().split('T')[0];

      memoryOrders.set('ord-10', {
        id: 'ord-10',
        vendor_id: vendorId,
        total_paise: 20000n,
        payment_method: 'cash',
        payment_status: 'paid',
        order_status: 'served',
        created_at: `${today}T14:00:00.000Z`,
      });

      memoryOrders.set('ord-11', {
        id: 'ord-11',
        vendor_id: vendorId,
        total_paise: 30000n,
        payment_method: 'upi',
        payment_status: 'paid',
        order_status: 'served',
        created_at: `${today}T15:00:00.000Z`,
      });

      // Order items:
      // Masala Chai: 3 + 2 = 5 cups
      // Steamed Chicken Momo: 6 plates
      // Paneer Roll: 1 roll
      memoryOrderItems.set('item-1', {
        id: 'item-1',
        order_id: 'ord-10',
        item_name: 'Masala Chai',
        quantity: 3,
      });
      memoryOrderItems.set('item-2', {
        id: 'item-2',
        order_id: 'ord-10',
        item_name: 'Steamed Chicken Momo',
        quantity: 2,
      });
      memoryOrderItems.set('item-3', {
        id: 'item-3',
        order_id: 'ord-11',
        item_name: 'Steamed Chicken Momo',
        quantity: 4,
      });
      memoryOrderItems.set('item-4', {
        id: 'item-4',
        order_id: 'ord-11',
        item_name: 'Masala Chai',
        quantity: 2,
      });
      memoryOrderItems.set('item-5', {
        id: 'item-5',
        order_id: 'ord-11',
        item_name: 'Paneer Roll',
        quantity: 1,
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/galla/summary?date=${today}`,
        headers: { Authorization: `Bearer ${cashierToken}` },
      });

      expect(res.statusCode).toBe(200);
      // Steamed Chicken Momo had total 6 quantity vs Masala Chai 5
      expect(res.json().summary.topSellingItem).toBe('Steamed Chicken Momo');
    });
  });

  describe('TEST 6: Day-End Fiscal Closing (Z-Report) & Persistence', () => {
    it('seals the business day into daily_summaries and generates street vendor WhatsApp text', async () => {
      const today = new Date().toISOString().split('T')[0];

      // Seed 1 order and 1 expense
      memoryOrders.set('ord-closing', {
        id: 'ord-closing',
        vendor_id: vendorId,
        total_paise: 40000n, // ₹400
        payment_method: 'cash',
        payment_status: 'paid',
        order_status: 'served',
        created_at: `${today}T18:00:00.000Z`,
      });
      memoryOrderItems.set('item-closing', {
        id: 'item-closing',
        order_id: 'ord-closing',
        item_name: 'Crispy Kurkure Momo',
        quantity: 4,
      });
      memoryExpenses.set('exp-closing', {
        id: 'exp-closing',
        vendor_id: vendorId,
        amount_paise: 5000n, // ₹50
        description: 'Carry bags',
        category: 'packaging',
        payment_method: 'cash',
        expense_date: today,
        created_at: `${today}T19:00:00.000Z`,
      });

      // Owner closes day
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/galla/close-day',
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: { date: today },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.status).toBe('success');
      expect(json.message).toContain('Z-Report generated');
      expect(json.summary.totalOrders).toBe(1);
      expect(json.summary.totalSalesPaise).toBe(40000);
      expect(json.summary.totalExpensesPaise).toBe(5000);
      expect(json.summary.netPaise).toBe(35000);
      expect(json.summary.topSellingItem).toBe('Crispy Kurkure Momo');

      // Verify formatted WhatsApp Z-Report string
      expect(json.zReportText).toContain('FROSE Street — Day-End Z-Report');
      expect(json.zReportText).toContain('Tibetan Momo & Chai Point');
      expect(json.zReportText).toContain('Total Sales:* ₹400.00');
      expect(json.zReportText).toContain('Cash: ₹400.00');
      expect(json.zReportText).toContain('Expenses:*   ₹50.00');
      expect(json.zReportText).toContain('Cash in Galla:* ₹350.00');
      expect(json.zReportText).toContain('Net Profit:*    ₹350.00');
      expect(json.zReportText).toContain('Crispy Kurkure Momo');

      // Subsequent live summary check must report isDayClosed: true
      const summaryRes = await app.inject({
        method: 'GET',
        url: `/api/v1/galla/summary?date=${today}`,
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(summaryRes.json().summary.isDayClosed).toBe(true);

      // Retrieve past historical Z-Reports
      const historyRes = await app.inject({
        method: 'GET',
        url: '/api/v1/galla/z-reports',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(historyRes.statusCode).toBe(200);
      expect(historyRes.json().summaries.length).toBe(1);
      expect(historyRes.json().summaries[0].summaryDate).toBe(today);
    });
  });

  describe('TEST 7: Role-Based Access Control & Strict Financial Blindness', () => {
    it('cooks and packers must be completely forbidden (403) from all Galla endpoints', async () => {
      // 1. Cook cannot view galla summary
      const cookSummary = await app.inject({
        method: 'GET',
        url: '/api/v1/galla/summary',
        headers: { Authorization: `Bearer ${cookToken}` },
      });
      expect(cookSummary.statusCode).toBe(403);
      expect(cookSummary.json().code).toBe('INSUFFICIENT_PERMISSIONS');

      // 2. Packer cannot view expenses
      const packerExpenses = await app.inject({
        method: 'GET',
        url: '/api/v1/galla/expenses',
        headers: { Authorization: `Bearer ${packerToken}` },
      });
      expect(packerExpenses.statusCode).toBe(403);

      // 3. Cook cannot log an expense
      const cookExp = await app.inject({
        method: 'POST',
        url: '/api/v1/galla/expenses',
        headers: { Authorization: `Bearer ${cookToken}` },
        payload: { amountPaise: 1000, description: 'Illegal' },
      });
      expect(cookExp.statusCode).toBe(403);

      // 4. Packer cannot close the fiscal day
      const packerClose = await app.inject({
        method: 'POST',
        url: '/api/v1/galla/close-day',
        headers: { Authorization: `Bearer ${packerToken}` },
      });
      expect(packerClose.statusCode).toBe(403);
    });

    it('cashier can view galla summary and log expenses, but CANNOT close fiscal day', async () => {
      // Cashier views summary -> 200 OK
      const cashSummary = await app.inject({
        method: 'GET',
        url: '/api/v1/galla/summary',
        headers: { Authorization: `Bearer ${cashierToken}` },
      });
      expect(cashSummary.statusCode).toBe(200);

      // Cashier logs expense -> 201 OK
      const cashExp = await app.inject({
        method: 'POST',
        url: '/api/v1/galla/expenses',
        headers: { Authorization: `Bearer ${cashierToken}` },
        payload: { amountPaise: 2000, description: 'Ice block', category: 'raw_material' },
      });
      expect(cashExp.statusCode).toBe(201);

      // Cashier attempts to close fiscal day -> 403 Forbidden!
      const cashClose = await app.inject({
        method: 'POST',
        url: '/api/v1/galla/close-day',
        headers: { Authorization: `Bearer ${cashierToken}` },
      });
      expect(cashClose.statusCode).toBe(403);
      expect(cashClose.json().code).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  describe('TEST 8: Real-Time WebSocket Event Emission', () => {
    it('broadcasts real-time events to owners and cashiers while excluding cooks and packers', async () => {
      const broadcastSpy = vi.spyOn(WebSocketHub, 'broadcast');

      // 1. Logging an expense triggers galla:expense_created
      await app.inject({
        method: 'POST',
        url: '/api/v1/galla/expenses',
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: {
          amountPaise: 4000,
          description: 'Ginger & Garlic 500g',
          category: 'raw_material',
        },
      });

      expect(broadcastSpy).toHaveBeenCalledWith(
        vendorId,
        'galla:expense_created',
        expect.objectContaining({
          amountPaise: 4000,
          description: 'Ginger & Garlic 500g',
        }),
        ['owner', 'cashier'], // Must be filtered strictly to financial roles
      );

      // 2. Closing fiscal day triggers galla:day_closed
      await app.inject({
        method: 'POST',
        url: '/api/v1/galla/close-day',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(broadcastSpy).toHaveBeenCalledWith(
        vendorId,
        'galla:day_closed',
        expect.objectContaining({
          totalSalesPaise: expect.any(Number),
        }),
        ['owner', 'cashier'],
      );

      broadcastSpy.mockRestore();
    });
  });
});



