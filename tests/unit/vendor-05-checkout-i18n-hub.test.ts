import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { AuthService } from '../../server/src/modules/auth/auth.service.js';
import { getDatabase } from '../../server/src/db/database.js';
import { signJoseAccessToken, getJwtKeyRotationConfig } from '../../server/src/modules/auth/jwt-jose.js';
import { loadConfig } from '../../server/src/config/env.js';

const rootDir = path.resolve(__dirname, '../..');
const clientDir = path.join(rootDir, 'client');

describe('VENDOR-05: Checkout, Z-Report, Outbox, Subscription Alerts, Rush Accelerators, i18n & Hub Alignment', () => {
  let app: FastifyInstance;
  let ownerCookie = '';

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();

    const db = getDatabase();
    const jwtConfig = getJwtKeyRotationConfig(loadConfig());
    const phone = `98${Math.floor(10000000 + Math.random() * 89999999)}`;
    const reg = await AuthService.registerVendor(db, {
      phone,
      password: 'Vendor05@Password',
      businessName: 'ZReport Variance Stall',
      ownerName: 'Cashier Dev',
      edition: 'cloud',
    });
    const token = await signJoseAccessToken(
      {
        sub: reg.vendor.id,
        phone: reg.vendor.phone,
        businessName: reg.vendor.business_name,
        role: 'owner',
        edition: 'cloud',
      },
      jwtConfig,
      900,
    );
    ownerCookie = `frose_access_token=${token}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('persists countedCashPaise on POST /api/v1/galla/close-day and computes variancePaise', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/galla/close-day',
      headers: {
        cookie: ownerCookie,
        'x-frose-csrf': '1',
      },
      payload: {
        countedCashPaise: 52500,
        notes: 'Verified evening cash float',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.summary).toBeDefined();
    expect(body.summary.countedCashPaise).toBe(52500);
    expect(typeof body.summary.variancePaise).toBe('number');
    expect(body.summary.variancePaise).toBe(52500);
    expect(body.zReportText).toContain('Counted');
  });

  it('updates variance immediately and submits countedCashPaise in payments-panel.js', () => {
    const paymentsJs = fs.readFileSync(path.join(clientDir, 'js/payments-panel.js'), 'utf8');
    const drawerFnStart = paymentsJs.indexOf('function openCloseDayDrawer');
    const drawerFnEnd = paymentsJs.indexOf('global.closeCloseDayDrawer', drawerFnStart);
    const drawerSection = paymentsJs.slice(drawerFnStart, drawerFnEnd);

    expect(drawerSection).toContain("countedInput.addEventListener('input', updateVariance)");
    expect(drawerSection).toMatch(/countedInput\.addEventListener\('input',\s*updateVariance\);\s*updateVariance\(\);/);
    expect(drawerSection).toContain('countedCashPaise');
  });

  it('hardens billing.js checkout, clear-cart guard, outbox inspector, subscription banner, and rush accelerators', () => {
    const billingHtml = fs.readFileSync(path.join(clientDir, 'billing.html'), 'utf8');
    const billingJs = fs.readFileSync(path.join(clientDir, 'js/billing.js'), 'utf8');

    expect(billingHtml).toContain('id="outbox-inspector-modal"');
    expect(billingHtml).toContain('id="modal-custom-item"');
    expect(billingHtml).toContain('id="btn-bill-custom-item"');
    expect(billingHtml).toContain('id="pos-subscription-banner"');

    // Split cash resets on cart total change
    expect(billingJs).toContain('lastCartTotalPaise');
    // Clear cart uses confirmModal
    const clearFn = billingJs.slice(billingJs.indexOf('window.clearCurrentCart'));
    expect(clearFn.slice(0, 500)).toContain('confirmModal');
    // Outbox inspector & subscription alert
    expect(billingJs).toContain('openOutboxInspector');
    expect(billingJs).toContain('/api/v1/subscriptions/status');
    // Custom item + per-item notes + / shortcut
    expect(billingJs).toContain('openCustomItemModal');
    expect(billingJs).toContain('apiItem.notes');
    expect(billingJs).toContain("e.key !== '/'");
  });

  it('adds Subscription & Plan Status card in settings-component.js', () => {
    const settingsJs = fs.readFileSync(path.join(clientDir, 'js/settings-component.js'), 'utf8');
    expect(settingsJs).toContain('settings-subscription-card');
    expect(settingsJs).toContain('/api/v1/subscriptions/status');
  });

  it('extends i18n.js across en/te/hi/ta for dynamic workspace strings', () => {
    const i18nJs = fs.readFileSync(path.join(clientDir, 'js/i18n.js'), 'utf8');
    const billingJs = fs.readFileSync(path.join(clientDir, 'js/billing.js'), 'utf8');
    const ordersJs = fs.readFileSync(path.join(clientDir, 'js/orders-panel.js'), 'utf8');
    const menuJs = fs.readFileSync(path.join(clientDir, 'js/menu-panel.js'), 'utf8');

    expect(i18nJs).toContain("'bill.all_items'");
    expect(i18nJs).toContain("'bill.add_short'");
    expect(i18nJs).toContain("'bill.custom_item'");
    expect(i18nJs).toContain("'orders.title'");
    expect(i18nJs).toContain("'menu.title'");

    expect(billingJs).toContain("tr('bill.add_short'");
    expect(ordersJs).toContain("tr('orders.title'");
    expect(menuJs).toContain("tr('menu.title'");
  });

  it('aligns index.html over tokens.css and eliminates dummy metrics and emojis', () => {
    const indexHtml = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf8');
    expect(indexHtml).toContain('/css/tokens.css');
    expect(indexHtml).toContain('/js/theme.js');
    expect(indexHtml).not.toContain('3,480');
    expect(indexHtml).not.toContain('1,950');
    expect(indexHtml).not.toContain('1,530');
    expect(indexHtml).not.toContain('PAIR-8821');
    expect(/[\u{1F300}-\u{1FAFF}]/u.test(indexHtml)).toBe(false);
  });
});
