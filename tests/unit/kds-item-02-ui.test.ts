import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('KDS-ITEM-02: Kitchen, Packaging & Orders Per-Item Checklist UI', () => {
  const clientDir = path.resolve(process.cwd(), 'client');

  it('kitchen.html and kitchen.js provide per-item checklist sheet, Mark All Ready, progress badge, and 1-tap single-item fast path', () => {
    const html = fs.readFileSync(path.join(clientDir, 'kitchen.html'), 'utf8');
    const js = fs.readFileSync(path.join(clientDir, 'js/kitchen.js'), 'utf8');

    expect(html).toContain('id="kds-item-sheet"');
    expect(html).toContain('id="btn-kds-item-back"');
    expect(js).toContain('/items/');
    expect(js).toContain('/fulfillment');
    expect(js).toContain('Mark All Ready');
    expect(js).toContain('order:item_updated');
    expect(js).toContain("openSheet('kds-item-sheet'");
    expect(js).toContain("closeSheet('kds-item-sheet'");
  });

  it('packaging.html and packaging.js provide partial-ready visibility, per-item packing checklist sheet, and Mark All Packed', () => {
    const html = fs.readFileSync(path.join(clientDir, 'packaging.html'), 'utf8');
    const js = fs.readFileSync(path.join(clientDir, 'js/packaging.js'), 'utf8');

    expect(html).toContain('id="pack-item-sheet"');
    expect(html).toContain('id="btn-pack-item-back"');
    expect(js).toContain('/items/');
    expect(js).toContain('/fulfillment');
    expect(js).toContain('partialReadyQueue');
    expect(js).toContain('Cooking in Kitchen');
    expect(js).toContain('Mark All Packed');
    expect(js).toContain('order:item_updated');
    expect(js).toContain("openSheet('pack-item-sheet'");
    expect(js).toContain("closeSheet('pack-item-sheet'");
  });

  it('orders-panel.js displays per-item Ready & Packed progress pills on order cards and detail drawer', () => {
    const js = fs.readFileSync(path.join(clientDir, 'js/orders-panel.js'), 'utf8');

    expect(js).toContain('kitchenReadyCount');
    expect(js).toContain('packagingReadyCount');
    expect(js).toContain('Ready');
    expect(js).toContain('Packed');
  });
});
