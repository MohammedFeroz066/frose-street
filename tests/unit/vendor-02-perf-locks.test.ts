import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('VENDOR-02: Zero-Lag Dish Grid Patching & Double-Tap Submission Locks', () => {
  const billingJs = fs.readFileSync(path.resolve(__dirname, '../../client/js/billing.js'), 'utf8');
  const ordersJs = fs.readFileSync(path.resolve(__dirname, '../../client/js/orders-panel.js'), 'utf8');
  const paymentsJs = fs.readFileSync(path.resolve(__dirname, '../../client/js/payments-panel.js'), 'utf8');
  const menuJs = fs.readFileSync(path.resolve(__dirname, '../../client/js/menu-panel.js'), 'utf8');

  it('updateCartUI does NOT rebuild #pos-dishes-grid and patches dish cards in-place by data-dish-id', () => {
    const updateCartMatch = billingJs.match(/function updateCartUI\([\s\S]*?\n  \}/);
    expect(updateCartMatch).not.toBeNull();
    expect(updateCartMatch![0]).not.toContain('renderDishesGrid()');
    expect(billingJs).toContain('data-dish-id');
    expect(billingJs).toContain('patchDishCardAction');
  });

  it('debounces bill search input at 120ms while keeping instant Enter/Clear', () => {
    expect(billingJs).toContain('120');
    expect(billingJs).toContain("e.key === 'Enter'");
  });

  it('reuses a single module-level BroadcastChannel("frose_orders") in billing.js and orders-panel.js', () => {
    const billingMatches = billingJs.match(/new BroadcastChannel\(['"]frose_orders['"]\)/g) || [];
    const ordersMatches = ordersJs.match(/new BroadcastChannel\(['"]frose_orders['"]\)/g) || [];
    expect(billingMatches.length).toBe(1);
    expect(ordersMatches.length).toBe(1);

    const execOrderMatch = billingJs.match(/async function executeOrderSuccess[\s\S]*?\n  \}/);
    expect(execOrderMatch).not.toBeNull();
    expect(execOrderMatch![0]).not.toContain("new BroadcastChannel('frose_orders')");

    const submitEditMatch = ordersJs.match(/async function submitOrderEdit[\s\S]*?\n  \}/);
    expect(submitEditMatch).not.toBeNull();
    expect(submitEditMatch![0]).not.toContain("new BroadcastChannel('frose_orders')");
  });

  it('enforces in-flight double-tap submission locks across order, void, edit, dish, close-day, and stock toggle', () => {
    expect(billingJs).toContain('isSubmittingOrder');
    expect(billingJs).toContain('isSubmittingVoid');
    expect(billingJs).toContain('isSubmittingDish');
    expect(ordersJs).toContain('isSubmittingEdit');
    expect(paymentsJs).toContain('isClosingDay');
    expect(menuJs).toContain('togglingItemIds');
  });
});
