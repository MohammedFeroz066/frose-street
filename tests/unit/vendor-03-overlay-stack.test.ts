import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('VENDOR-03: Unified Overlay Stack, Tap-Outside, Escape & Browser Back History', () => {
  const uiComponentsJs = fs.readFileSync(path.resolve(__dirname, '../../client/js/ui-components.js'), 'utf8');
  const billingPageJs = fs.readFileSync(path.resolve(__dirname, '../../client/js/billing-page.js'), 'utf8');
  const billingHtml = fs.readFileSync(path.resolve(__dirname, '../../client/billing.html'), 'utf8');
  const ordersJs = fs.readFileSync(path.resolve(__dirname, '../../client/js/orders-panel.js'), 'utf8');
  const paymentsJs = fs.readFileSync(path.resolve(__dirname, '../../client/js/payments-panel.js'), 'utf8');
  const kitchenHtml = fs.readFileSync(path.resolve(__dirname, '../../client/kitchen.html'), 'utf8');
  const packagingHtml = fs.readFileSync(path.resolve(__dirname, '../../client/packaging.html'), 'utf8');
  const kitchenJs = fs.readFileSync(path.resolve(__dirname, '../../client/js/kitchen.js'), 'utf8');
  const packagingJs = fs.readFileSync(path.resolve(__dirname, '../../client/js/packaging.js'), 'utf8');
  const menuSetupHtml = fs.readFileSync(path.resolve(__dirname, '../../client/menu-setup.html'), 'utf8');

  it('ui-components.js implements LIFO overlayStack with tap-outside, Escape key, scroll-lock, and history support', () => {
    expect(uiComponentsJs).toContain('overlayStack');
    expect(uiComponentsJs).toContain('closeTopOverlay');
    expect(uiComponentsJs).toContain('data-static-backdrop');
    expect(uiComponentsJs).toContain("e.key === 'Escape'");
    expect(uiComponentsJs).toContain('froseOverlay');
    expect(uiComponentsJs).toContain('saas-modal-open');
  });

  it('orders-panel.js and payments-panel.js route drawers through FroseUI.openSheet / closeSheet', () => {
    expect(ordersJs).toContain("openSheet('order-detail-drawer'");
    expect(ordersJs).toContain("closeSheet('order-detail-drawer'");
    expect(paymentsJs).toContain("openSheet('close-day-drawer'");
    expect(paymentsJs).toContain("closeSheet('close-day-drawer'");
  });

  it('billing-page.js and billing.js coordinate froseTab & froseOverlay popstate history cleanly', () => {
    expect(billingPageJs).toContain('closeTopOverlay');
    expect(billingPageJs).toContain('froseTab');
    expect(billingPageJs).toContain('froseOverlay');
  });

  it('kitchen.js and packaging.js integrate station switch overlay with FroseUI', () => {
    expect(kitchenJs).toContain('FroseUI.openSheet');
    expect(kitchenJs).toContain('FroseUI.closeSheet');
    expect(packagingJs).toContain('FroseUI.openSheet');
    expect(packagingJs).toContain('FroseUI.closeSheet');
  });

  it('provides clear in-app Back buttons on Checkout, Order Detail, Z-Report, Menu Setup, and Station Switch', () => {
    expect(billingHtml).toContain('btn-checkout-back');
    expect(billingHtml).toContain('btn-order-detail-back');
    expect(billingHtml).toContain('btn-zreport-back');
    expect(menuSetupHtml).toContain('btn-header-back');
    expect(kitchenHtml).toContain('btn-station-back');
    expect(packagingHtml).toContain('btn-station-back');
  });
});
